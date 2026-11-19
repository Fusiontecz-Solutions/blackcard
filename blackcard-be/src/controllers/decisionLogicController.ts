import { Response, Request, NextFunction } from "express";
import { decisionLogicService } from "../services/decisionLogicService";
import { generateDecisionLogicReportPdf } from "../services/pdf/decisionLogicReport.service";

export const decisionLogicController = {
    async initiateDecisionLogic(
        request: Request,
        response: Response,
        next: NextFunction
    ) {
        try {
            const { businessOwnerId, bankAccountId } = request.body;
            await decisionLogicService.generateDecisionLogicLink(
                businessOwnerId,
                bankAccountId
            );
            response.status(200).json({ message: "Decision logic link generated" });
        } catch (error) {
            next(error);
        }
    },

    async verifyRequestLink(
        request: Request,
        response: Response,
        next: NextFunction
    ) {
        const { token } = request.body;

        try {
            const validatedData =
                await decisionLogicService.validateDecisionLogicToken(token);

            response.status(200).json({
                message: "The token is successfully validated and is valid for use.",
                data: validatedData,
            });
        } catch (error) {
            next(error);
        }
    },

    async initiateRequestCode(
        request: Request,
        response: Response,
        next: NextFunction
    ) {
        try {
            const { businessOwnerId, bankAccountId, applicationId } = request.body;

            const { requestCode } =
                await decisionLogicService.createAndVerifyRequest(
                    businessOwnerId,
                    bankAccountId,
                    applicationId,
                );

            response.status(200).json({
                message: "Request code generated successfully.",
                requestCode,
            })
        
        } catch (error) {
            next(error);
        }
    },

    async generateDecisonReport(
        request: Request,
        response: Response,
        next: NextFunction
    ) {
        try {
            const { requestCode, businessOwnerId, bankAccountId } = request.body;

            const rc =
                typeof requestCode === "string"
                    ? requestCode.trim()
                    : String(requestCode ?? "");
            const bo = Number(businessOwnerId);
            const ba = Number(bankAccountId);
            // eslint-disable-next-line no-console
            console.info(
                "[DecisionLogic] POST /generate-report",
                {
                    requestCodePrefix: rc.slice(0, 4),
                    requestCodeLength: rc.length,
                    businessOwnerId: Number.isFinite(bo) ? bo : businessOwnerId,
                    bankAccountId: Number.isFinite(ba) ? ba : bankAccountId,
                },
            );

            if (!rc || !Number.isFinite(bo) || bo <= 0 || !Number.isFinite(ba) || ba <= 0) {
                response.status(400).json({
                    message:
                        "Invalid body: requestCode (non-empty string), businessOwnerId, and bankAccountId (positive numbers) are required.",
                });
                return;
            }

            const savedReport = await decisionLogicService.fetchDecisionLogicReportAndSave(
                rc,
                bo,
                ba
            );

            response.status(200).json({
                message: "Decision Logic Report generated successfully.",
                data: savedReport,
            });
        } catch (error) {
            next(error);
        }
    },

    async fetchDecisionLogicReport(
        request: Request,
        response: Response,
        next: NextFunction
    ) {
        const { businessOwnerId } = request.query;

        const parseBusinessOwnerId = parseInt(businessOwnerId as string, 10);

        try {
            const decisionLogicReport =
                await decisionLogicService.fetchDecisionLogicReport(
                    parseBusinessOwnerId
                );

            response.status(200).json({
                message: "Decision Logic Report fetched successfully.",
                data: decisionLogicReport,
            });
        } catch (error) {
            next(error);
        }
    },

    async downloadDecisionLogicReportPdf(
        request: Request,
        response: Response,
        next: NextFunction
    ) {
        const { businessOwnerId } = request.query;
        const parseBusinessOwnerId = parseInt(businessOwnerId as string, 10);

        try {
            if (!Number.isFinite(parseBusinessOwnerId) || parseBusinessOwnerId <= 0) {
                response.status(400).json({
                    message: "businessOwnerId query parameter is required.",
                });
                return;
            }

            const decisionLogicReport =
                await decisionLogicService.fetchDecisionLogicReport(
                    parseBusinessOwnerId
                );

            const { buffer, filename } =
                await generateDecisionLogicReportPdf(decisionLogicReport);

            response.setHeader("Content-Type", "application/pdf");
            response.setHeader(
                "Content-Disposition",
                `attachment; filename="${filename}"`,
            );
            response.status(200).send(buffer);
        } catch (error) {
            next(error);
        }
    },
};
