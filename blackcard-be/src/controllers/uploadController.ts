import type { Request, Response } from 'express';
import uploadService from '../services/uploadService';
import {
    assertAllowedCloudinaryUrl,
    streamCloudinaryInlinePreview,
} from '../services/cloudinaryInlinePreviewService';

class UploadController {
    // Upload single file
    async uploadSingle(req: Request, res: Response) {
        try {
            const reqFiles = (req as any).files;
            if (!reqFiles || !reqFiles.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded',
                });
            }

            const file = reqFiles.file;
            const requestedFolder =
                typeof req.body?.folder === 'string' ? req.body.folder.trim() : '';
            const allowedFolders = new Set(['ih-crm/documents', 'ih-crm/background-checks']);
            const folder = allowedFolders.has(requestedFolder)
                ? requestedFolder
                : 'ih-crm/documents';

            const result = await uploadService.uploadFile(file, folder);

            if (!result.success) {
                return res.status(500).json(result);
            }

            return res.status(200).json({
                success: true,
                message: 'File uploaded successfully',
                data: {
                    url: result.data?.secure_url,
                    publicId: result.data?.public_id,
                    originalName: result.fileName,
                    format: result.data?.format,
                    size: result.data?.bytes,
                },
            });
        } catch (error) {
            console.error('Upload single file error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Upload multiple files
    async uploadMultiple(req: Request, res: Response) {
        try {
            const reqFiles = (req as any).files;
            if (!reqFiles || !reqFiles.files) {
                return res.status(400).json({
                    success: false,
                    message: 'No files uploaded',
                });
            }

            const folder = 'ih-crm/documents';

            // Handle both single and multiple files
            let files = reqFiles.files;
            if (!Array.isArray(files)) {
                files = [files];
            }

            const results = await uploadService.uploadMultipleFiles(files, folder);

            const uploadedFiles = results
                .filter((result) => result.success)
                .map((result) => ({
                    url: result.data?.secure_url,
                    publicId: result.data?.public_id,
                    originalName: result.fileName,
                    format: result.data?.format,
                    size: result.data?.bytes,
                }));

            const failedFiles = results.filter((result) => !result.success);

            return res.status(200).json({
                success: true,
                message: `${uploadedFiles.length} file(s) uploaded successfully`,
                data: uploadedFiles,
                failed: failedFiles.length > 0 ? failedFiles : undefined,
            });
        } catch (error) {
            console.error('Upload multiple files error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    /**
     * Proxy Cloudinary assets with Content-Disposition: inline so PDFs load in an iframe
     * (raw uploads default to attachment). Authenticated; URL must match this account's cloud.
     */
    async streamInlinePreview(req: Request, res: Response) {
        try {
            const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
            const nameParam =
                typeof req.query.name === 'string' ? req.query.name.trim() : '';
            const mimeTypeHint =
                typeof req.query.mimeType === 'string' ? req.query.mimeType.trim() : '';

            const validationError = assertAllowedCloudinaryUrl(rawUrl);
            if (validationError) {
                return res.status(validationError.status).json({
                    success: false,
                    message: validationError.message,
                });
            }

            await streamCloudinaryInlinePreview(res, rawUrl, nameParam, mimeTypeHint || undefined);
            return;
        } catch (error) {
            console.error('streamInlinePreview error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Delete file from Cloudinary
    async deleteFile(req: Request, res: Response) {
        try {
            const { publicId, resourceType } = req.body;

            if (!publicId) {
                return res.status(400).json({
                    success: false,
                    message: 'Public ID is required',
                });
            }

            const result = await uploadService.deleteFile(publicId, resourceType || 'raw');

            return res.status(200).json(result);
        } catch (error) {
            console.error('Delete file error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }
}

const uploadController = new UploadController();
export default uploadController;
