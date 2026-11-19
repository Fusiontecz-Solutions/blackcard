import express from "express";
import { AutomatedBankStatementController } from "./automatedBankStatement.controller";

const router = express.Router();
const controller = new AutomatedBankStatementController();

router.post(
    "/upload-statement",
    controller.uploadAndParse.bind(controller)
);

router.post(
    "/upload-statement/download-csv",
    controller.uploadAndDownloadCsv.bind(controller)
);

export default router;

