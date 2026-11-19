// import express from "express";
// import { authenticateToken } from "../middleware/authMiddleware";
// import businessInfoController from "../controllers/businessInfoController";

// const router = express.Router();

// // All business info routes require authentication
// router.use(authenticateToken);

// // Fetch single business info row (or null data)
// router.get(
//   "/application/:applicationId",
//   businessInfoController.getByApplication.bind(businessInfoController),
// );

// // Create or update single business info row for the application
// router.post(
//   "/application/:applicationId",
//   businessInfoController.upsertByApplication.bind(businessInfoController),
// );

// export default router;

