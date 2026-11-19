// @ts-nocheck
import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';

const mapMonthToApi = (month: any) => {
  if (!month) return month;

  const {
    id,
    monthName,
    date,
    amount,
    application,
    applicationId,
    createdBy,
    createdById,
    createdAt,
    updatedAt,
    ...rest
  } = month;

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
    monthName,
    date,
    amount,
    application: mappedApplication ?? applicationId,
    createdBy: mappedCreatedBy ?? createdById,
    createdAt,
    updatedAt,
  };
};

// Resolve application by UUID (id) or numeric applicationId — role-independent; same data for Agent and Scrubbing
async function resolveApplicationByAnyId(applicationParam: string): Promise<{ id: string } | null> {
  const s = String(applicationParam).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const app = await prisma.application.findUnique({
      where: { applicationId: Number(s) },
      select: { id: true },
    });
    return app;
  }
  const app = await prisma.application.findUnique({
    where: { id: s },
    select: { id: true },
  });
  return app;
}

class MonthController {
  // Create a new month
  async createMonth(req: Request, res: Response) {
    try {
      const { monthName, date, amount, application } = req.body;

      if (!monthName || !date || amount === undefined || !application) {
        return res.status(400).json({
          success: false,
          message: 'monthName, date, amount, and application are required',
        });
      }

      const applicationRecord = await resolveApplicationByAnyId(String(application));
      if (!applicationRecord) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      const existingMonths = await prisma.month.findMany({
        where: { applicationId: applicationRecord.id },
        orderBy: { date: 'asc' },
      });
      if (existingMonths.length >= 3) {
        return res.status(400).json({
          success: false,
          message: 'Maximum of 3 months can be added per application',
        });
      }

      const dateObj = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(new Date(dateObj).getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format',
        });
      }

      if (existingMonths.length > 0) {
        const sortedMonths = [...existingMonths].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );

        const mostRecentMonthDate = new Date(sortedMonths[0].date);
        const expectedDate = new Date(mostRecentMonthDate);
        expectedDate.setMonth(expectedDate.getMonth() + 1);

        const inputDateNormalized = new Date(dateObj);
        inputDateNormalized.setHours(0, 0, 0, 0);
        const expectedDateNormalized = new Date(expectedDate);
        expectedDateNormalized.setHours(0, 0, 0, 0);

        const daysDifference =
          Math.abs(
            inputDateNormalized.getTime() - expectedDateNormalized.getTime(),
          ) /
          (1000 * 60 * 60 * 24);

        if (daysDifference > 5) {
          return res.status(400).json({
            success: false,
            message: `Date must be approximately one month after the previous month's date. Expected date around: ${
              expectedDateNormalized.toISOString().split('T')[0]
            }`,
          });
        }
      }

      const createdBy = (req as any).user?.id;
      if (!createdBy) {
        return res.status(401).json({
          success: false,
          message: 'User authentication required',
        });
      }

      const amountNum =
        typeof amount === 'string'
          ? parseFloat(amount.replace(/[^0-9.-]+/g, ''))
          : Number(amount);

      if (isNaN(amountNum)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid amount format',
        });
      }

      const month = await prisma.month.create({
        data: {
          monthName: monthName.trim(),
          date: new Date(dateObj),
          amount: amountNum,
          applicationId: applicationRecord.id,
          createdById: createdBy,
        },
        include: {
          application: {
            select: {
              id: true,
              applicationId: true,
              priority: true,
              type: true,
              currentQueue: true,
              currentState: true,
            },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Month created successfully',
        data: mapMonthToApi(month),
      });
    } catch (error) {
      console.error('Create month error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Update a month
  async updateMonth(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { monthName, date, amount, application } = req.body;

      const month = await prisma.month.findUnique({ where: { id } });
      if (!month) {
        return res.status(404).json({
          success: false,
          message: 'Month not found',
        });
      }

      const data: any = {};

      if (application) {
        const applicationRecord = await resolveApplicationByAnyId(String(application));
        if (!applicationRecord) {
          return res.status(404).json({
            success: false,
            message: 'Application not found',
          });
        }
        data.applicationId = applicationRecord.id;
      }

      if (monthName !== undefined) {
        data.monthName = monthName.trim();
      }
      let dateObj: Date;
      if (date !== undefined) {
        dateObj = typeof date === 'string' ? new Date(date) : (date as Date);
        if (isNaN(dateObj.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid date format',
          });
        }

        const existingMonths = await prisma.month.findMany({
          where: {
            applicationId: data.applicationId || month.applicationId,
            NOT: { id: month.id },
          },
          orderBy: { date: 'asc' },
        });

        if (existingMonths.length > 0) {
          const monthsBefore = existingMonths.filter(
            (m: any) => new Date(m.date).getTime() < dateObj.getTime(),
          );
          const monthsAfter = existingMonths.filter(
            (m: any) => new Date(m.date).getTime() > dateObj.getTime(),
          );

          if (monthsBefore.length > 0) {
            const previousMonth = monthsBefore[monthsBefore.length - 1];
            const previousDate = new Date(previousMonth.date);
            const expectedDate = new Date(previousDate);
            expectedDate.setMonth(expectedDate.getMonth() + 1);

            const inputDateNormalized = new Date(dateObj!);
            inputDateNormalized.setHours(0, 0, 0, 0);
            const expectedDateNormalized = new Date(expectedDate);
            expectedDateNormalized.setHours(0, 0, 0, 0);

            const daysDifference =
              Math.abs(
                inputDateNormalized.getTime() -
                  expectedDateNormalized.getTime(),
              ) /
              (1000 * 60 * 60 * 24);

            if (daysDifference > 5) {
              return res.status(400).json({
                success: false,
                message: `Date must be approximately one month after the previous month's date (${previousDate
                  .toISOString()
                  .split('T')[0]}). Expected date around: ${
                  expectedDateNormalized.toISOString().split('T')[0]
                }`,
              });
            }
          }

          if (monthsAfter.length > 0) {
            const nextMonth = monthsAfter[0];
            const nextDate = new Date(nextMonth.date);
            const expectedNextDate = new Date(dateObj!);
            expectedNextDate.setMonth(expectedNextDate.getMonth() + 1);

            const nextDateNormalized = new Date(nextDate);
            nextDateNormalized.setHours(0, 0, 0, 0);
            const expectedNextDateNormalized = new Date(expectedNextDate);
            expectedNextDateNormalized.setHours(0, 0, 0, 0);

            const daysDifference =
              Math.abs(
                nextDateNormalized.getTime() -
                  expectedNextDateNormalized.getTime(),
              ) /
              (1000 * 60 * 60 * 24);

            if (daysDifference > 5) {
              return res.status(400).json({
                success: false,
                message: `This date update would break the one-month gap rule. The next month (${nextDate
                  .toISOString()
                  .split('T')[0]}) should be one month after this date. Expected next month around: ${
                  expectedNextDateNormalized.toISOString().split('T')[0]
                }`,
              });
            }
          }
        }

        data.date = dateObj;
      }

      if (amount !== undefined) {
        const amountNum =
          typeof amount === 'string'
            ? parseFloat(amount.replace(/[^0-9.-]+/g, ''))
            : Number(amount);
        if (isNaN(amountNum)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid amount format',
          });
        }
        data.amount = amountNum;
      }

      const updatedMonth = await prisma.month.update({
        where: { id },
        data,
        include: {
          application: {
            select: {
              id: true,
              applicationId: true,
              priority: true,
              type: true,
              currentQueue: true,
              currentState: true,
            },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Month updated successfully',
        data: mapMonthToApi(updatedMonth),
      });
    } catch (error) {
      console.error('Update month error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Delete a month
  async deleteMonth(req: Request, res: Response) {
    try {
      const { id } = req.params;

      try {
        await prisma.month.delete({ where: { id } });
      } catch (err: any) {
        if (err.code === 'P2025') {
          return res.status(404).json({
            success: false,
            message: 'Month not found',
          });
        }
        throw err;
      }

      return res.status(200).json({
        success: true,
        message: 'Month deleted successfully',
      });
    } catch (error) {
      console.error('Delete month error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get month by ID
  async getMonthById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const month = await prisma.month.findUnique({
        where: { id },
      });

      if (!month) {
        return res.status(404).json({
          success: false,
          message: 'Month not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: mapMonthToApi(month),
      });
    } catch (error) {
      console.error('Get month by id error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get all months for a specific application
  async getAllMonths(req: Request, res: Response) {
    try {
      const { application } = req.query;

      if (!application) {
        return res.status(400).json({
          success: false,
          message: 'application query parameter is required',
        });
      }

      // Accept UUID or numeric applicationId — role-independent; Agent and Scrubbing see same months (and thus same transactions)
      const appRecord = await resolveApplicationByAnyId(String(application));
      if (!appRecord) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      const months = await prisma.month.findMany({
        where: { applicationId: appRecord.id },
        orderBy: { date: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: months.map(mapMonthToApi),
      });
    } catch (error) {
      console.error('Get all months error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}

const monthController = new MonthController();
export default monthController;

