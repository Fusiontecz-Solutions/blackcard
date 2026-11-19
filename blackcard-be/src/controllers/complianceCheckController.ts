import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';
import {
  resolveApplicationAttributedUserId,
  APPLICATION_USER_ATTRIBUTION_ERROR,
} from '../middleware/authMiddleware';

const findApplication = async (applicationIdOrUuid: unknown) => {
  const raw = Array.isArray(applicationIdOrUuid) ? applicationIdOrUuid[0] : applicationIdOrUuid;
  const str = raw != null && typeof raw !== 'object' ? String(raw) : '';
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    return prisma.application.findUnique({ where: { applicationId: Number(str) } });
  }
  return prisma.application.findUnique({ where: { id: str } });
};

const mapComplianceCheckToApi = (check: any) => {
  if (!check) return check;

  const {
    id,
    question,
    answer,
    reason,
    signature,
    date,
    application,
    applicationId,
    createdBy,
    createdById,
    createdAt,
    updatedAt,
    ...rest
  } = check;

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
    question,
    answer,
    reason,
    signature,
    date,
    application: mappedApplication ?? applicationId,
    createdBy: mappedCreatedBy ?? createdById,
    createdAt,
    updatedAt,
  };
};

class ComplianceCheckController {
  // Create or update a compliance check
  async createOrUpdate(req: Request, res: Response) {
    try {
      const { question, answer, reason, signature, date, application } = req.body;

      if (!question || !answer || !application) {
        return res.status(400).json({
          success: false,
          message: 'question, answer, and application are required',
        });
      }

      if (!['yes', 'no'].includes(answer)) {
        return res.status(400).json({
          success: false,
          message: 'answer must be either "yes" or "no"',
        });
      }

      if (answer === 'yes' && !reason) {
        return res.status(400).json({
          success: false,
          message: 'reason is required when answer is "yes"',
        });
      }

      const applicationRecord = await findApplication(application);
      if (!applicationRecord) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      // Resolve a tenant User.id safe for the required createdById FK.
      // Super Admin proxy requests have no row in the tenant User table, so we
      // fall back to the application's creator / sales representative.
      const createdBy = await resolveApplicationAttributedUserId(req, {
        createdById: applicationRecord.createdById,
        salesRepresentativeId: applicationRecord.salesRepresentativeId,
      });
      if (!createdBy) {
        console.error('User attribution error - req.user:', (req as any).user);
        return res.status(400).json({
          success: false,
          message: APPLICATION_USER_ATTRIBUTION_ERROR,
        });
      }

      const existingCheck = await prisma.complianceCheck.findFirst({
        where: {
          question: question.trim(),
          applicationId: applicationRecord.id,
        },
      });

      let complianceCheckRecord;

      if (existingCheck) {
        complianceCheckRecord = await prisma.complianceCheck.update({
          where: { id: existingCheck.id },
          data: {
            answer,
            reason: answer === 'yes' ? (reason?.trim() || '') : null,
            signature: signature?.trim() || null,
            date: date?.trim() || null,
            createdById: existingCheck.createdById ?? createdBy,
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
      } else {
        complianceCheckRecord = await prisma.complianceCheck.create({
          data: {
            question: question.trim(),
            answer,
            reason: answer === 'yes' ? (reason?.trim() || '') : null,
            signature: signature?.trim() || null,
            date: date?.trim() || null,
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
      }

      return res.status(200).json({
        success: true,
        message: 'Compliance check saved successfully',
        data: mapComplianceCheckToApi(complianceCheckRecord),
      });
    } catch (error) {
      console.error('Create or update compliance check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get all compliance checks for an application
  async getAll(req: Request, res: Response) {
    try {
      const { application } = req.query;

      if (!application) {
        return res.status(400).json({
          success: false,
          message: 'application query parameter is required',
        });
      }

      const applicationRecord = await findApplication(application);
      if (!applicationRecord) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      const complianceChecks = await prisma.complianceCheck.findMany({
        where: { applicationId: applicationRecord.id },
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
        orderBy: { createdAt: 'asc' },
      });

      return res.status(200).json({
        success: true,
        message: 'Compliance checks retrieved successfully',
        data: complianceChecks.map(mapComplianceCheckToApi),
      });
    } catch (error) {
      console.error('Get compliance checks error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get a single compliance check by ID
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const complianceCheck = await prisma.complianceCheck.findUnique({
        where: { id },
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

      if (!complianceCheck) {
        return res.status(404).json({
          success: false,
          message: 'Compliance check not found',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Compliance check retrieved successfully',
        data: mapComplianceCheckToApi(complianceCheck),
      });
    } catch (error) {
      console.error('Get compliance check by ID error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Delete a compliance check
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      try {
        await prisma.complianceCheck.delete({ where: { id } });
      } catch (err: any) {
        if (err.code === 'P2025') {
          return res.status(404).json({
            success: false,
            message: 'Compliance check not found',
          });
        }
        throw err;
      }

      return res.status(200).json({
        success: true,
        message: 'Compliance check deleted successfully',
      });
    } catch (error) {
      console.error('Delete compliance check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}

const complianceCheckController = new ComplianceCheckController();
export default complianceCheckController;

