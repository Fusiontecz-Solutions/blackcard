import prisma from '../config/prismaClient';
import uploadService from './uploadService';

const APPLICATION_FILES_FOLDER = 'ih-crm/applications';

/**
 * Uploads a PDF buffer to Cloudinary and links it to the application as an ApplicationFile.
 * Best-effort: logs and swallows errors so caller can still succeed if storage fails.
 */
export async function attachBufferAsApplicationFile(
    applicationId: string,
    buffer: Buffer,
    originalName: string
): Promise<void> {
    const name = String(originalName || 'application.pdf').trim() || 'application.pdf';
    try {
        const result = await uploadService.uploadBuffer(buffer, APPLICATION_FILES_FOLDER, name);
        if (!result.success || !result.data) {
            console.error('[attachBufferAsApplicationFile] Upload failed:', result.error || result.message);
            return;
        }
        const data = result.data;
        await prisma.applicationFile.create({
            data: {
                applicationId,
                url: data.secure_url,
                publicId: data.public_id,
                originalName: name,
                mimeType: (data.format as string) || 'application/pdf',
                size: typeof data.bytes === 'number' ? data.bytes : buffer.length,
                uploadedAt: new Date(),
            },
        });
    } catch (err: any) {
        console.error('[attachBufferAsApplicationFile] Unexpected error:', err?.message || err);
    }
}
