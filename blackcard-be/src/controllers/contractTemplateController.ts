import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';
import { replaceLegacyBrandInDisplayName } from '../constants/brand';
import { resolveOptionalTenantUserId } from '../middleware/authMiddleware';
import uploadService from '../services/uploadService';
import { funderContractLayoutKey } from '../utils/funderContractLayout';
import { isPersistedFunderProfileId } from '../services/funderProfileService';

class ContractTemplateController {
    // Upload a new global contract template (PDF) and persist it
    async upload(req: Request, res: Response) {
        try {
            const reqFiles = (req as any).files;
            if (!reqFiles || !reqFiles.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded',
                });
            }

            const file = reqFiles.file;

            // Only allow PDFs for contract templates
            if (file.mimetype !== 'application/pdf') {
                return res.status(400).json({
                    success: false,
                    message: 'Only PDF files are allowed for contract templates',
                });
            }

            const folder = 'ih-crm/contract-templates';
            const result = await uploadService.uploadFile(file, folder);

            if (!result.success || !result.data) {
                return res.status(500).json({
                    success: false,
                    message: result.message || 'Failed to upload contract template',
                });
            }

            const currentUserId = await resolveOptionalTenantUserId(req);

            const template = await prisma.contractTemplate.create({
                data: {
                    url: result.data.secure_url,
                    publicId: result.data.public_id,
                    originalName: replaceLegacyBrandInDisplayName(result.fileName),
                    uploadedById: currentUserId,
                },
                include: {
                    uploadedBy: {
                        select: { id: true, firstName: true, lastName: true, email: true },
                    },
                },
            });

            return res.status(200).json({
                success: true,
                message: 'Contract template uploaded successfully',
                data: template,
            });
        } catch (error: any) {
            console.error('Upload contract template error:', error);
            return res.status(500).json({
                success: false,
                message: error?.message || 'Internal server error',
            });
        }
    }

    // Get the most recently uploaded global contract template
    async getLatest(req: Request, res: Response) {
        try {
            const funderProfileId = String(req.query.funderProfileId || '').trim();
            if (isPersistedFunderProfileId(funderProfileId)) {
                const layoutKey = funderContractLayoutKey(funderProfileId);
                const funderTemplate = await prisma.boldSignTemplate.findFirst({
                    where: { OR: [{ layoutKey }, { templateId: layoutKey }] },
                    orderBy: { createdAt: 'desc' },
                    select: { pdfUrl: true, name: true, originalFileName: true },
                });
                const pdfUrl = String(funderTemplate?.pdfUrl || '').trim();
                if (pdfUrl && /^https?:\/\//i.test(pdfUrl)) {
                    return res.status(200).json({
                        success: true,
                        data: {
                            url: pdfUrl,
                            originalName: replaceLegacyBrandInDisplayName(
                                String(
                                    funderTemplate?.originalFileName ||
                                        funderTemplate?.name ||
                                        'Contract.pdf',
                                ),
                            ),
                        },
                    });
                }
            }

            const latest = await prisma.contractTemplate.findFirst({
                orderBy: { createdAt: 'desc' },
            });

            if (latest) {
                return res.status(200).json({
                    success: true,
                    data: {
                        ...latest,
                        originalName: replaceLegacyBrandInDisplayName(latest.originalName),
                    },
                });
            }

            return res.status(200).json({
                success: true,
                data: null,
            });
        } catch (error: any) {
            console.error('Get latest contract template error:', error);
            return res.status(500).json({
                success: false,
                message: error?.message || 'Internal server error',
            });
        }
    }
}

const contractTemplateController = new ContractTemplateController();
export default contractTemplateController;

