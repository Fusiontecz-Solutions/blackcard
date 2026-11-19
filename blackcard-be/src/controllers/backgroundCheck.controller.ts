// @ts-nocheck
import type { Request, Response } from 'express';
import backgroundCheckService, { BackgroundCheckError } from '../services/backgroundCheckService';

const actor = (req: Request) => ({ id: (req as any).user?.id, role: (req as any).user?.role });

const handle = async (res: Response, fn: () => Promise<unknown>, okStatus = 200) => {
    try {
        const data = await fn();
        return res.status(okStatus).json({ success: true, data });
    } catch (error: any) {
        const status = error instanceof BackgroundCheckError ? error.statusCode : 500;
        if (status >= 500) console.error('[backgroundCheck] error:', error?.message || error);
        return res.status(status).json({ success: false, message: error?.message || 'Internal server error' });
    }
};

class BackgroundCheckController {
    // GET /background-checks/application/:applicationId  (lazy-creates the check + 6 items)
    getForApplication(req: Request, res: Response) {
        return handle(res, () => backgroundCheckService.getOrCreateForApplication(req.params.applicationId, actor(req)));
    }

    // POST /background-checks/application/:applicationId/company-research
    //   { businessName?, address1?, city?, state?, zipCode?, ein?, ownerName? }
    companyResearch(req: Request, res: Response) {
        return handle(res, () =>
            backgroundCheckService.runCompanyResearch(req.params.applicationId, req.body ?? {}, actor(req), req),
        );
    }

    // PATCH /background-checks/items/:itemId  { result?, notes?, status?, required? }
    updateItem(req: Request, res: Response) {
        return handle(res, () => backgroundCheckService.updateItem(req.params.itemId, req.body ?? {}, actor(req)));
    }

    // POST /background-checks/items/:itemId/run
    runItem(req: Request, res: Response) {
        return handle(res, () => backgroundCheckService.runAutomatedItem(req.params.itemId, actor(req)));
    }

    // POST /background-checks/items/:itemId/attachments  { url, publicId?, originalName? }
    addAttachment(req: Request, res: Response) {
        return handle(res, () => backgroundCheckService.addAttachment(req.params.itemId, req.body ?? {}, actor(req)), 201);
    }

    // DELETE /background-checks/attachments/:id
    removeAttachment(req: Request, res: Response) {
        return handle(res, () => backgroundCheckService.removeAttachment(req.params.id, actor(req)));
    }

    // POST /background-checks/items/:itemId/map-to-exhibit
    mapToExhibit(req: Request, res: Response) {
        return handle(res, () => backgroundCheckService.mapClearCorporationsToExhibit(req.params.itemId, actor(req)));
    }

    // PATCH /background-checks/:checkId/required  { flags: { TLO: true, ... } }
    setRequired(req: Request, res: Response) {
        return handle(res, () => backgroundCheckService.setRequiredFlags(req.params.checkId, req.body?.flags ?? {}, actor(req)));
    }

    // POST /background-checks/:checkId/decision  { outcome, reasonText, reasonCode?, conditionsText?, overrideFail? }
    decide(req: Request, res: Response) {
        return handle(res, () => backgroundCheckService.recordDecision(req.params.checkId, req.body ?? {}, actor(req)));
    }

    // POST /background-checks/:checkId/reopen
    reopen(req: Request, res: Response) {
        return handle(res, () => backgroundCheckService.reopen(req.params.checkId, actor(req)));
    }

    // GET /background-checks/:checkId/audit
    audit(req: Request, res: Response) {
        return handle(res, async () => {
            const check = await backgroundCheckService.getCheck(req.params.checkId);
            return (check as any)?.events ?? [];
        });
    }
}

export default new BackgroundCheckController();
