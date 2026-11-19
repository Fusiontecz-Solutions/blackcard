import { Request, Response } from "express";
import fileUpload from "express-fileupload";
import { AutomatedBankStatementService } from "./automatedBankStatement.service";

const service = new AutomatedBankStatementService();

export class AutomatedBankStatementController {

    private getUploadedFile(req: Request): fileUpload.UploadedFile | null {
        if (!req.files || !req.files.file) return null;
        const file = req.files.file;
        return Array.isArray(file)
            ? (file[0] as fileUpload.UploadedFile)
            : (file as fileUpload.UploadedFile);
    }

    async uploadAndParse(req: Request, res: Response) {
        try {
            const uploadedFile = this.getUploadedFile(req);
            if (!uploadedFile) {
                return res.status(400).json({
                    success: false,
                    message: "No file uploaded"
                });
            }

            // ✅ IMPORTANT: use tempFilePath
            if (!uploadedFile.tempFilePath) {
                return res.status(400).json({
                    success: false,
                    message: "File upload failed (no temp file path)"
                });
            }

            const result = await service.parsePDF(uploadedFile.tempFilePath);
            const wantsJson = String(req.query.json || "").toLowerCase() === "true";

            // Default behavior: download CSV in browser.
            // Use ?json=true to keep old JSON response behavior.
            if (!wantsJson) {
                const csvContent = result.csv || "";
                const baseName = uploadedFile.name?.replace(/\.[^/.]+$/, "") || "bank-statement";
                const filename = `${baseName}-transactions.csv`;

                res.setHeader("Content-Type", "text/csv; charset=utf-8");
                res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
                return res.status(200).send(`\uFEFF${csvContent}`);
            }

            return res.status(200).json({
                success: true,
                message: "PDF parsed successfully",
                data: result
            });

        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    async uploadAndDownloadCsv(req: Request, res: Response) {
        try {
            const uploadedFile = this.getUploadedFile(req);
            if (!uploadedFile) {
                return res.status(400).json({
                    success: false,
                    message: "No file uploaded"
                });
            }

            if (!uploadedFile.tempFilePath) {
                return res.status(400).json({
                    success: false,
                    message: "File upload failed (no temp file path)"
                });
            }

            const result = await service.parsePDF(uploadedFile.tempFilePath);
            const csvContent = result.csv || "";
            const baseName = uploadedFile.name?.replace(/\.[^/.]+$/, "") || "bank-statement";
            const filename = `${baseName}-transactions.csv`;

            // BOM improves Excel UTF-8 handling.
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            return res.status(200).send(`\uFEFF${csvContent}`);
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

