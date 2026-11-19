// @ts-nocheck
import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';
import { blockIfClaimRequired } from '../services/underwriterClaimGuard';

const mapFinalAnswerToApi = (record: any) => {
  if (!record) return record;

  const {
    id,
    Application,
    application,
    applicationId,
    questionKey,
    questionLabel,
    answer,
    createdAt,
    updatedAt,
    ...rest
  } = record;

  // Prisma relation field on FinalAnswer is named `Application` (capital A).
  // Keep a fallback for older code paths that may have used `application`.
  const relatedApplication = Application ?? application;

  const mappedApplication =
    relatedApplication &&
    ({
      _id: relatedApplication.id,
      id: relatedApplication.id,
      applicationId: relatedApplication.applicationId,
      priority: relatedApplication.priority,
      type: relatedApplication.type,
      currentQueue: relatedApplication.currentQueue,
      currentState: relatedApplication.currentState,
    } as any);

  return {
    ...rest,
    _id: id,
    id,
    application: mappedApplication ?? applicationId,
    questionKey,
    questionLabel,
    answer,
    createdAt,
    updatedAt,
  };
};

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

class FinalAnswerController {
  // Upsert a single answer
  async upsert(req: Request, res: Response) {
    try {
      const { applicationId: application, questionKey, questionLabel, answer } = req.body;

      if (!application || !questionKey || !questionLabel) {
        return res.status(400).json({
          success: false,
          message: 'applicationId, questionKey and questionLabel are required',
        });
      }

      const appRecord = await resolveApplicationByAnyId(application);
      if (!appRecord) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }
      if (await blockIfClaimRequired(req, res, appRecord.id)) return;

      const now = new Date();

      const record = await prisma.finalAnswer.upsert({
        where: {
          applicationId_questionKey: {
            applicationId: appRecord.id,
            questionKey: String(questionKey).trim(),
          },
        },
        create: {
          applicationId: appRecord.id,
          questionKey: String(questionKey).trim(),
          questionLabel: String(questionLabel).trim(),
          answer: answer != null ? String(answer) : null,
        },
        update: {
          questionLabel: String(questionLabel).trim(),
          answer: answer != null ? String(answer) : null,
          updatedAt: now,
        },
        include: {
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
        },
      });

      const isCreated = record.createdAt.getTime() === record.updatedAt.getTime();

      return res.status(200).json({
        success: true,
        message: isCreated
          ? 'Final answer created successfully'
          : 'Final answer updated successfully',
        data: mapFinalAnswerToApi(record),
      });
    } catch (error: any) {
      console.error('Upsert final answer error:', error);

      if (error.code === 'P2002') {
        return res.status(409).json({
          success: false,
          message: 'An answer for this question already exists for this application',
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Bulk upsert answers for an application
  async bulkUpsert(req: Request, res: Response) {
    try {
      const { applicationId: application, answers } = req.body;

      if (!application || !Array.isArray(answers)) {
        return res.status(400).json({
          success: false,
          message: 'applicationId and answers array are required',
        });
      }

      const appRecord = await resolveApplicationByAnyId(application);
      if (!appRecord) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }
      if (await blockIfClaimRequired(req, res, appRecord.id)) return;

      const now = new Date();

      const operations = answers.map((item) => {
        const { questionKey, questionLabel, answer } = item || {};
        if (!questionKey || !questionLabel) {
          return null;
        }

        return prisma.finalAnswer.upsert({
          where: {
            applicationId_questionKey: {
              applicationId: appRecord.id,
              questionKey: String(questionKey).trim(),
            },
          },
          create: {
            applicationId: appRecord.id,
            questionKey: String(questionKey).trim(),
            questionLabel: String(questionLabel).trim(),
            answer: answer != null ? String(answer) : null,
          },
          update: {
            questionLabel: String(questionLabel).trim(),
            answer: answer != null ? String(answer) : null,
            updatedAt: now,
          },
          include: {
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
          },
        });
      }).filter(Boolean) as any[];

      if (!operations.length) {
        return res.status(400).json({
          success: false,
          message: 'No valid answers to save',
        });
      }

      // Execute as parallel operations instead of a long-running transaction
      const records = await Promise.all(operations);

      return res.status(200).json({
        success: true,
        message: 'Final answers saved successfully',
        data: records.map(mapFinalAnswerToApi),
      });
    } catch (error) {
      console.error('Bulk upsert final answers error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Fetch all answers for an application
  async getByApplication(req: Request, res: Response) {
    try {
      const { applicationId: application } = req.query;

      if (!application) {
        return res.status(400).json({
          success: false,
          message: 'applicationId query parameter is required',
        });
      }

      const appRecord = await resolveApplicationByAnyId(application);
      if (!appRecord) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      const records = await prisma.finalAnswer.findMany({
        where: { applicationId: appRecord.id },
        orderBy: { createdAt: 'asc' },
        include: {
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
        },
      });

      return res.status(200).json({
        success: true,
        data: records.map(mapFinalAnswerToApi),
      });
    } catch (error) {
      console.error('Get final answers by application error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}

const finalAnswerController = new FinalAnswerController();
export default finalAnswerController;

