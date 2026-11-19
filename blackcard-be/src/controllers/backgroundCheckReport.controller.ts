import type { Request, Response } from 'express';
import {
  generateBackgroundCheckReportPdf,
  type BackgroundCheckReportPayload,
} from '../services/pdf/backgroundCheckReport.service';

class BackgroundCheckReportController {
  async downloadPdf(req: Request, res: Response) {
    try {
      const payload = req.body as BackgroundCheckReportPayload;
      if (!payload || typeof payload !== 'object' || !payload.checks) {
        return res.status(400).json({ success: false, message: 'Invalid background check report payload' });
      }

      const { buffer, filename } = await generateBackgroundCheckReportPdf(payload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(buffer);
    } catch (error: unknown) {
      console.error('Background check report PDF error:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate compliance report PDF';
      return res.status(500).json({ success: false, message });
    }
  }
}

export default new BackgroundCheckReportController();
