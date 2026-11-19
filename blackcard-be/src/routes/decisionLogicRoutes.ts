import { Router } from "express";
import { decisionLogicController } from "../controllers/decisionLogicController";

const decisionLogicRouter = Router({ mergeParams: true });

const {
  initiateDecisionLogic,
  verifyRequestLink,
  initiateRequestCode,
  generateDecisonReport,
  fetchDecisionLogicReport,
  downloadDecisionLogicReportPdf,
} = decisionLogicController;

decisionLogicRouter.post("/initiate", initiateDecisionLogic);
decisionLogicRouter.post("/verify", verifyRequestLink);
decisionLogicRouter.post("/request-code", initiateRequestCode);
decisionLogicRouter.post("/generate-report", generateDecisonReport);
decisionLogicRouter.get("/report/pdf", downloadDecisionLogicReportPdf);
decisionLogicRouter.get("/report", fetchDecisionLogicReport);

export default decisionLogicRouter;
