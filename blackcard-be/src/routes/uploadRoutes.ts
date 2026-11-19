import express from 'express';
import uploadController from '../controllers/uploadController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

/** Inline PDF/document preview (Bearer auth; iframe cannot send headers, so FE uses blob URL). */
router.get(
    '/inline-preview',
    authenticateToken,
    uploadController.streamInlinePreview.bind(uploadController),
);

// Upload single file (field: 'file')
router.post('/single', uploadController.uploadSingle.bind(uploadController));

// Upload multiple files (field: 'files')
router.post('/multiple', uploadController.uploadMultiple.bind(uploadController));

// Delete file from Cloudinary
router.delete('/', uploadController.deleteFile.bind(uploadController));

export default router;
