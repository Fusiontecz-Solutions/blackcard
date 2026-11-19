import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';
import { resolveApplicationAttributedUserId } from '../middleware/authMiddleware';
import { blockIfClaimRequired } from '../services/underwriterClaimGuard';

const resolveApplicationByAnyId = async (application: any) => {
  const applicationStr = String(application);

  if (/^\d+$/.test(applicationStr)) {
    return prisma.application.findUnique({
      where: { applicationId: Number(applicationStr) },
    });
  }

  return prisma.application.findUnique({
    where: { id: applicationStr },
  });
};

const mapBankAnalysisRowToApi = (row: any) => {
  if (!row) return row;

  const {
    id,
    monthLabel,
    monthDate,
    totalCredit,
    loanTransfer,
    deposit,
    other,
    nsfNegDays,
    lowBlcDays,
    avgDailyBlc,
    createdAt,
    updatedAt,
    bankAnalysisId,
    ...rest
  } = row;

  return {
    ...rest,
    _id: id,
    id,
    monthLabel,
    monthDate,
    totalCredit,
    loanTransfer,
    deposit,
    other,
    nsfNegDays,
    lowBlcDays,
    avgDailyBlc,
    bankAnalysis: bankAnalysisId,
    createdAt,
    updatedAt,
  };
};

const computeTotals = (rows: any[]) => {
  return rows.reduce(
    (acc, row) => {
      acc.totalCredit += row.totalCredit || 0;
      acc.loanTransfer += row.loanTransfer || 0;
      acc.deposit += row.deposit || 0;
      acc.other += row.other || 0;
      const net = (row.totalCredit || 0) - (row.loanTransfer || 0);
      acc.netCredit += net;
      acc.nsfNegDays += row.nsfNegDays || 0;
      acc.lowBlcDays += row.lowBlcDays || 0;
      acc.avgDailyBlc += row.avgDailyBlc || 0;
      return acc;
    },
    {
      totalCredit: 0,
      loanTransfer: 0,
      deposit: 0,
      other: 0,
      netCredit: 0,
      nsfNegDays: 0,
      lowBlcDays: 0,
      avgDailyBlc: 0,
    },
  );
};

const mapBankAnalysisToApi = (analysis: any) => {
  if (!analysis) return analysis;

  const {
    id,
    applicationId,
    bankName,
    accountNumber,
    createdById,
    createdAt,
    updatedAt,
    ...rest
  } = analysis;

  const rows = (analysis as any).rows ?? (analysis as any).BankAnalysisRow;
  const application = (analysis as any).application ?? (analysis as any).Application;
  const createdBy = (analysis as any).createdBy ?? (analysis as any).User;

  const mappedRows = Array.isArray(rows) ? rows.map(mapBankAnalysisRowToApi) : [];
  const totals = computeTotals(mappedRows);

  const mappedApplication =
    application &&
    ({
      _id: application.id,
      id: application.id,
      applicationId: application.applicationId,
      priority: application.priority,
      type: application.type,
      currentQueue: application.currentQueue,
      currentState: application.currentState,
    } as any);

  const mappedCreatedBy =
    createdBy &&
    ({
      _id: createdBy.id,
      id: createdBy.id,
      firstName: createdBy.firstName,
      lastName: createdBy.lastName,
      email: createdBy.email,
    } as any);

  return {
    ...rest,
    _id: id,
    id,
    bankName,
    accountNumber,
    application: mappedApplication ?? applicationId,
    createdBy: mappedCreatedBy ?? createdById,
    rows: mappedRows,
    totals,
    createdAt,
    updatedAt,
  };
};

class BankAnalysisController {
  // Create or update a single row under a bank analysis (fast path for row-level saves)
  async upsertRow(req: Request, res: Response) {
    try {
      const { bankId } = req.params;
      const {
        rowId,
        monthLabel,
        monthDate,
        totalCredit,
        loanTransfer,
        deposit,
        other,
        nsfNegDays,
        lowBlcDays,
        avgDailyBlc,
      } = req.body as Record<string, any>;

      const bank = await prisma.bankAnalysis.findUnique({
        where: { id: bankId },
      });

      if (!bank) {
        return res.status(404).json({
          success: false,
          message: 'Bank analysis not found',
        });
      }

      if (await blockIfClaimRequired(req, res, bank.applicationId)) return;

      const safeNumber = (val: any) => {
        if (val === null || val === undefined || val === '') return 0;
        const num =
          typeof val === 'number'
            ? val
            : parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
        return Number.isNaN(num) ? 0 : num;
      };

      const normalizedMonthLabel = String(monthLabel ?? '').trim();
      if (!normalizedMonthLabel) {
        return res.status(400).json({
          success: false,
          message: 'monthLabel is required',
        });
      }

      const payload = {
        monthLabel: normalizedMonthLabel,
        monthDate: monthDate ? new Date(monthDate) : new Date(),
        totalCredit: safeNumber(totalCredit),
        loanTransfer: safeNumber(loanTransfer),
        deposit: safeNumber(deposit),
        other: safeNumber(other),
        nsfNegDays: safeNumber(nsfNegDays),
        lowBlcDays: safeNumber(lowBlcDays),
        avgDailyBlc: safeNumber(avgDailyBlc),
      };

      let row;
      if (rowId) {
        const existingRow = await prisma.bankAnalysisRow.findFirst({
          where: {
            id: String(rowId),
            bankAnalysisId: bankId,
          },
          select: { id: true },
        });

        if (!existingRow) {
          return res.status(404).json({
            success: false,
            message: 'Bank analysis row not found',
          });
        }

        row = await prisma.bankAnalysisRow.update({
          where: { id: existingRow.id },
          data: payload,
        });
      } else {
        const existingByMonth = await prisma.bankAnalysisRow.findFirst({
          where: {
            bankAnalysisId: bankId,
            monthLabel: normalizedMonthLabel,
          },
          select: { id: true },
        });

        if (existingByMonth?.id) {
          row = await prisma.bankAnalysisRow.update({
            where: { id: existingByMonth.id },
            data: payload,
          });
        } else {
          row = await prisma.bankAnalysisRow.create({
            data: {
              bankAnalysisId: bankId,
              ...payload,
            },
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Bank analysis row saved successfully',
        data: mapBankAnalysisRowToApi(row),
      });
    } catch (error) {
      console.error('Upsert bank analysis row error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get all bank analyses for an application (with rows and aggregated totals)
  async getByApplication(req: Request, res: Response) {
    try {
      const { application } = req.query;

      if (!application) {
        return res.status(400).json({
          success: false,
          message: 'application query parameter is required',
        });
      }

      const applicationRecord = await resolveApplicationByAnyId(application);
      if (!applicationRecord) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      const analyses = await prisma.bankAnalysis.findMany({
        where: { applicationId: applicationRecord.id },
        include: {
          BankAnalysisRow: {
            orderBy: {
              monthDate: 'desc',
            },
          },
          Application: {
            select: {
              id: true,
              applicationId: true,
              priority: true,
              type: true,
              currentQueue: true,
              currentState: true,
            },
          },
          User: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      const mapped = analyses.map(mapBankAnalysisToApi);

      return res.status(200).json({
        success: true,
        data: mapped,
      });
    } catch (error) {
      console.error('Get bank analyses by application error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Create a new bank analysis entry (optionally with initial rows)
  async create(req: Request, res: Response) {
    try {
      const { application, bankName, accountNumber, rows } = req.body as {
        application?: string | number;
        bankName?: string;
        accountNumber?: string;
        rows?: Array<any>;
      };

      if (!application) {
        return res.status(400).json({
          success: false,
          message: 'application is required',
        });
      }

      const applicationRecord = await resolveApplicationByAnyId(application);
      if (!applicationRecord) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }
      if (await blockIfClaimRequired(req, res, applicationRecord.id)) return;

      // Resolve a tenant User.id safe for the required `fk_bank_analysis_user`
      // foreign key. Regular JWT users attribute to themselves; Super Admin
      // proxy requests have no tenant User row, so fall back to the
      // application's creator or sales representative.
      const createdBy = await resolveApplicationAttributedUserId(req, {
        createdById: applicationRecord.createdById,
        salesRepresentativeId: applicationRecord.salesRepresentativeId,
      });
      if (!createdBy) {
        return res.status(401).json({
          success: false,
          message: 'User authentication required',
        });
      }

      const analysis = await prisma.bankAnalysis.create({
        data: {
          applicationId: applicationRecord.id,
          bankName: bankName ? String(bankName).trim() : null,
          accountNumber: accountNumber ? String(accountNumber).trim() : '',
          createdById: createdBy,
        },
        include: {
          BankAnalysisRow: true,
          Application: {
            select: {
              id: true,
              applicationId: true,
              priority: true,
              type: true,
              currentQueue: true,
              currentState: true,
            },
          },
          User: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      // If rows were provided, create them now
      if (Array.isArray(rows) && rows.length > 0) {
        const preparedRows = rows.map((row) => {
          const safeNumber = (val: any) => {
            if (val === null || val === undefined || val === '') return 0;
            const num =
              typeof val === 'number'
                ? val
                : parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
            return Number.isNaN(num) ? 0 : num;
          };

          return {
            bankAnalysisId: analysis.id,
            monthLabel: String(row.monthLabel ?? row.month ?? ''),
            monthDate: row.monthDate ? new Date(row.monthDate) : new Date(),
            totalCredit: safeNumber(row.totalCredit),
            loanTransfer: safeNumber(row.loanTransfer),
            deposit: safeNumber(row.deposit),
            other: safeNumber(row.other),
            nsfNegDays: safeNumber(row.nsfNegDays),
            lowBlcDays: safeNumber(row.lowBlcDays),
            avgDailyBlc: safeNumber(row.avgDailyBlc),
          };
        });

        await prisma.bankAnalysisRow.createMany({
          data: preparedRows,
        });
      }

      const withRows = await prisma.bankAnalysis.findUnique({
        where: { id: analysis.id },
        include: {
          BankAnalysisRow: {
            orderBy: {
              monthDate: 'desc',
            },
          },
          Application: {
            select: {
              id: true,
              applicationId: true,
              priority: true,
              type: true,
              currentQueue: true,
              currentState: true,
            },
          },
          User: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Bank analysis created successfully',
        data: mapBankAnalysisToApi(withRows),
      });
    } catch (error) {
      console.error('Create bank analysis error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Update bank analysis details and replace all rows
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { bankName, accountNumber, rows } = req.body as {
        bankName?: string;
        accountNumber?: string;
        rows?: Array<any>;
      };

      const existing = await prisma.bankAnalysis.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Bank analysis not found',
        });
      }
      if (await blockIfClaimRequired(req, res, existing.applicationId)) return;

      const data: any = {};
      if (bankName !== undefined) {
        data.bankName = bankName ? String(bankName).trim() : null;
      }
      if (accountNumber !== undefined) {
        data.accountNumber = String(accountNumber).trim();
      }

      await prisma.$transaction(async (tx) => {
        if (Object.keys(data).length > 0) {
          await tx.bankAnalysis.update({
            where: { id },
            data,
          });
        }

        if (Array.isArray(rows)) {
          await tx.bankAnalysisRow.deleteMany({
            where: { bankAnalysisId: id },
          });

          if (rows.length > 0) {
            const preparedRows = rows.map((row) => {
              const safeNumber = (val: any) => {
                if (val === null || val === undefined || val === '') return 0;
                const num =
                  typeof val === 'number'
                    ? val
                    : parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
                return Number.isNaN(num) ? 0 : num;
              };

              return {
                bankAnalysisId: id,
                monthLabel: String(row.monthLabel ?? row.month ?? ''),
                monthDate: row.monthDate ? new Date(row.monthDate) : new Date(),
                totalCredit: safeNumber(row.totalCredit),
                loanTransfer: safeNumber(row.loanTransfer),
                deposit: safeNumber(row.deposit),
                other: safeNumber(row.other),
                nsfNegDays: safeNumber(row.nsfNegDays),
                lowBlcDays: safeNumber(row.lowBlcDays),
                avgDailyBlc: safeNumber(row.avgDailyBlc),
              };
            });

            await tx.bankAnalysisRow.createMany({
              data: preparedRows,
            });
          }
        }
      });

      const updated = await prisma.bankAnalysis.findUnique({
        where: { id },
        include: {
          BankAnalysisRow: {
            orderBy: {
              monthDate: 'desc',
            },
          },
          Application: {
            select: {
              id: true,
              applicationId: true,
              priority: true,
              type: true,
              currentQueue: true,
              currentState: true,
            },
          },
          User: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Bank analysis updated successfully',
        data: mapBankAnalysisToApi(updated),
      });
    } catch (error) {
      console.error('Update bank analysis error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Delete a single row from a bank analysis
  async deleteRow(req: Request, res: Response) {
    try {
      const { bankId, rowId } = req.params;

      const row = await prisma.bankAnalysisRow.findFirst({
        where: {
          id: rowId,
          bankAnalysisId: bankId,
        },
      });

      if (!row) {
        return res.status(404).json({
          success: false,
          message: 'Bank analysis row not found',
        });
      }
      const rowBank = await prisma.bankAnalysis.findUnique({
        where: { id: bankId },
        select: { applicationId: true },
      });
      if (await blockIfClaimRequired(req, res, rowBank?.applicationId)) return;

      await prisma.bankAnalysisRow.delete({
        where: { id: rowId },
      });

      return res.status(200).json({
        success: true,
        message: 'Row deleted successfully',
      });
    } catch (error) {
      console.error('Delete bank analysis row error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Delete bank analysis and its rows
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const existing = await prisma.bankAnalysis.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Bank analysis not found',
        });
      }
      if (await blockIfClaimRequired(req, res, existing.applicationId)) return;

      await prisma.$transaction(async (tx) => {
        await tx.bankAnalysisRow.deleteMany({
          where: { bankAnalysisId: id },
        });
        await tx.bankAnalysis.delete({
          where: { id },
        });
      });

      return res.status(200).json({
        success: true,
        message: 'Bank analysis deleted successfully',
      });
    } catch (error) {
      console.error('Delete bank analysis error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}

const bankAnalysisController = new BankAnalysisController();
export default bankAnalysisController;

