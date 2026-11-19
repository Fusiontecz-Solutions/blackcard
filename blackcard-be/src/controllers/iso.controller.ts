import type { Request, Response } from 'express';
import isoService from '../services/iso.service';

class IsoController {
    async create(req: Request, res: Response) {
        try {
            const iso = await isoService.create(req.body ?? {});
            return res.status(201).json({
                success: true,
                message: 'ISO created successfully',
                data: iso,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error?.message || 'Failed to create ISO',
            });
        }
    }

    async getAll(_req: Request, res: Response) {
        try {
            const data = await isoService.getAll();
            return res.status(200).json({
                success: true,
                data,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error?.message || 'Failed to fetch ISOs',
            });
        }
    }

    async getById(req: Request, res: Response) {
        try {
            const iso = await isoService.getById(req.params.id);
            if (!iso) {
                return res.status(404).json({
                    success: false,
                    message: 'ISO not found',
                });
            }
            return res.status(200).json({
                success: true,
                data: iso,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error?.message || 'Failed to fetch ISO',
            });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const iso = await isoService.update(req.params.id, req.body ?? {});
            return res.status(200).json({
                success: true,
                message: 'ISO updated successfully',
                data: iso,
            });
        } catch (error: any) {
            const status = String(error?.message || '').toLowerCase().includes('not found')
                ? 404
                : 400;
            return res.status(status).json({
                success: false,
                message: error?.message || 'Failed to update ISO',
            });
        }
    }

    async delete(req: Request, res: Response) {
        try {
            await isoService.delete(req.params.id);
            return res.status(200).json({
                success: true,
                message: 'ISO deleted successfully',
            });
        } catch (error: any) {
            const status = String(error?.message || '').toLowerCase().includes('not found')
                ? 404
                : 400;
            return res.status(status).json({
                success: false,
                message: error?.message || 'Failed to delete ISO',
            });
        }
    }
}

const isoController = new IsoController();
export default isoController;
