import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';
import { PaymentTemplateType } from '@prisma/client';

const VALID_CATEGORIES = new Set<PaymentTemplateType>([
  PaymentTemplateType.contract,
  PaymentTemplateType.email,
  PaymentTemplateType.letter,
]);

const normalizeVariables = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
};

class PaymentTemplateController {
  async getAll(req: Request, res: Response) {
    try {
      const categoryParam =
        typeof req.query.category === 'string' ? req.query.category : undefined;
      const category =
        categoryParam && categoryParam !== 'all'
          ? (categoryParam as PaymentTemplateType)
          : undefined;

      if (categoryParam && categoryParam !== 'all' && !VALID_CATEGORIES.has(category as PaymentTemplateType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category filter',
        });
      }

      const templates = await prisma.paymentTemplate.findMany({
        where: category
          ? {
              category,
            }
          : undefined,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });

      return res.status(200).json({
        success: true,
        data: templates,
      });
    } catch (error: any) {
      console.error('Get payment templates error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const { name, category, variables, body, status } = req.body ?? {};
      const createdById = (req as any).user?.id ?? null;

      if (!String(name ?? '').trim() || !String(body ?? '').trim()) {
        return res.status(400).json({
          success: false,
          message: 'Template name and body are required',
        });
      }

      if (!VALID_CATEGORIES.has(String(category ?? '') as PaymentTemplateType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid template category',
        });
      }

      const template = await prisma.paymentTemplate.create({
        data: {
          name: String(name).trim(),
          category: String(category) as PaymentTemplateType,
          variables: normalizeVariables(variables),
          body: String(body).trim(),
          status: String(status || 'active'),
          createdById,
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Template created successfully',
        data: template,
      });
    } catch (error: any) {
      console.error('Create payment template error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, category, variables, body, status } = req.body ?? {};

      const existing = await prisma.paymentTemplate.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Template not found',
        });
      }

      if (category !== undefined && !VALID_CATEGORIES.has(String(category) as PaymentTemplateType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid template category',
        });
      }

      const payload: any = {};
      if (name !== undefined) payload.name = String(name).trim();
      if (category !== undefined) payload.category = String(category) as PaymentTemplateType;
      if (variables !== undefined) payload.variables = normalizeVariables(variables);
      if (body !== undefined) payload.body = String(body).trim();
      if (status !== undefined) payload.status = String(status);

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields provided to update',
        });
      }

      if ('name' in payload && !payload.name) {
        return res.status(400).json({
          success: false,
          message: 'Template name cannot be empty',
        });
      }

      if ('body' in payload && !payload.body) {
        return res.status(400).json({
          success: false,
          message: 'Template body cannot be empty',
        });
      }

      const template = await prisma.paymentTemplate.update({
        where: { id },
        data: payload,
      });

      return res.status(200).json({
        success: true,
        message: 'Template updated successfully',
        data: template,
      });
    } catch (error: any) {
      console.error('Update payment template error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const existing = await prisma.paymentTemplate.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Template not found',
        });
      }

      await prisma.paymentTemplate.delete({ where: { id } });

      return res.status(200).json({
        success: true,
        message: 'Template deleted successfully',
      });
    } catch (error: any) {
      console.error('Delete payment template error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }
}

const paymentTemplateController = new PaymentTemplateController();
export default paymentTemplateController;
