import type { Request, Response } from 'express';
import {
  getLetterTemplateById,
  listLetterTemplates,
  parseListLetterTemplatesQuery,
} from '../services/letterTemplateService';

class LetterTemplateController {
  async list(req: Request, res: Response) {
    try {
      const options = parseListLetterTemplatesQuery(
        req.query as Record<string, unknown>,
      );
      const data = await listLetterTemplates(options);

      return res.status(200).json({
        success: true,
        data,
        meta: {
          count: data.length,
          funder: options.funder ?? null,
          status: options.status ?? null,
          includeBuiltin: options.includeBuiltin !== false,
          includeDatabase: options.includeDatabase !== false,
        },
      });
    } catch (error: unknown) {
      console.error('List letter templates error:', error);
      const message =
        error instanceof Error ? error.message : 'Internal server error';
      return res.status(500).json({
        success: false,
        message,
      });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const id = String(req.params.id ?? '').trim();
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Template id is required',
        });
      }

      const funderRaw =
        typeof req.query.funder === 'string' ? req.query.funder.trim() : '';
      const template = await getLetterTemplateById(id, {
        funder: funderRaw || undefined,
      });

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Letter template not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: template,
      });
    } catch (error: unknown) {
      console.error('Get letter template error:', error);
      const message =
        error instanceof Error ? error.message : 'Internal server error';
      return res.status(500).json({
        success: false,
        message,
      });
    }
  }
}

const letterTemplateController = new LetterTemplateController();
export default letterTemplateController;
