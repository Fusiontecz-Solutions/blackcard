// @ts-nocheck
import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';

const mapApplicationQuestionResponseToApi = (resp: any) => {
  if (!resp) return resp;

  const {
    id,
    application,
    applicationId,
    questionId,
    questionText,
     answer,
    reason,
    updatedBy,
    updatedById,
    createdAt,
    updatedAt,
    ...rest
  } = resp;

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

  const mappedUpdatedBy =
    updatedBy &&
    ({
      _id: updatedBy.id,
      id: updatedBy.id,
      firstName: updatedBy.firstName,
      lastName: updatedBy.lastName,
      email: updatedBy.email,
    } as any);

  return {
    ...rest,
    _id: id,
    id,
    application: mappedApplication ?? applicationId,
    questionId,
    questionText,
    answer,
    reason,
    updatedBy: mappedUpdatedBy ?? updatedById,
    createdAt,
    updatedAt,
  };
};

const resolveApplicationByAnyId = async (application: any) => {
  const applicationStr = String(application);

  if (/^\d+$/.test(applicationStr)) {
    // numeric business applicationId
    return prisma.application.findUnique({
      where: { applicationId: Number(applicationStr) },
    });
  }

  // assume UUID primary key
  return prisma.application.findUnique({
    where: { id: applicationStr },
  });
};

class ApplicationQuestionController {
  // Create or Update (Upsert) application question response
  async createOrUpdate(req: Request, res: Response) {
    try {
      const { application, questionId, questionText, answer, reason } = req.body;

      if (!application || !questionId || !questionText || !answer) {
        return res.status(400).json({
          success: false,
          message: 'application, questionId, questionText, and answer are required',
        });
      }

      if (answer !== 'YES' && answer !== 'NO') {
        return res.status(400).json({
          success: false,
          message: 'answer must be either "YES" or "NO"',
        });
      }

      if (answer === 'YES') {
        if (!reason || reason.trim() === '') {
          return res.status(400).json({
            success: false,
            message: 'reason is required when answer is "YES"',
          });
        }
      } else {
        if (reason && reason.trim() !== '') {
          return res.status(400).json({
            success: false,
            message: 'reason must be empty when answer is "NO"',
          });
        }
      }

      const appRecord = await resolveApplicationByAnyId(application);
      if (!appRecord) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      const updatedBy = (req as any).user?.id;
      if (!updatedBy) {
        return res.status(401).json({
          success: false,
          message: 'User authentication required',
        });
      }

      const trimmedQuestionId = String(questionId).trim();

      const now = new Date();
      const response = await prisma.applicationQuestionResponse.upsert({
        where: {
          applicationId_questionId: {
            applicationId: appRecord.id,
            questionId: trimmedQuestionId,
          },
        },
        create: {
          applicationId: appRecord.id,
          questionId: trimmedQuestionId,
          questionText: String(questionText).trim(),
          answer,
          reason: answer === 'YES' ? String(reason).trim() : '',
          updatedById: updatedBy,
        },
        update: {
          questionText: String(questionText).trim(),
          answer,
          reason: answer === 'YES' ? String(reason).trim() : '',
          updatedById: updatedBy,
          updatedAt: now,
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
          updatedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      const isCreated = response.createdAt.getTime() === response.updatedAt.getTime();
      const message = isCreated
        ? 'Application question response created successfully'
        : 'Application question response updated successfully';

      return res.status(200).json({
        success: true,
        message,
        data: mapApplicationQuestionResponseToApi(response),
      });
    } catch (error: any) {
      console.error('Create or update application question response error:', error);

      if (error.code === 'P2002') {
        return res.status(409).json({
          success: false,
          message: 'A response for this question already exists for this application',
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get all application question responses for an application
  async getAll(req: Request, res: Response) {
    try {
      const { application } = req.query;

      if (!application) {
        return res.status(400).json({
          success: false,
          message: 'application query parameter is required',
        });
      }

      const appRecord = await resolveApplicationByAnyId(application);
      if (!appRecord) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      const responses = await prisma.applicationQuestionResponse.findMany({
        where: { applicationId: appRecord.id },
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
          updatedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: responses.map(mapApplicationQuestionResponseToApi),
      });
    } catch (error) {
      console.error('Get all application question responses error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get single application question response by ID
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const response = await prisma.applicationQuestionResponse.findUnique({
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
          updatedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      if (!response) {
        return res.status(404).json({
          success: false,
          message: 'Application question response not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: mapApplicationQuestionResponseToApi(response),
      });
    } catch (error) {
      console.error('Get application question response by id error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}

const applicationQuestionController = new ApplicationQuestionController();
export default applicationQuestionController;

