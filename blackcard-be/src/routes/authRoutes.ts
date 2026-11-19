import express from 'express';
import authController from '../controllers/authController';
import { authenticateToken } from '../middleware/authMiddleware';
import { requireAdmin } from '../middleware/requireAdmin';

const router = express.Router();

router.post('/register', authController.register.bind(authController));
router.post(
    '/bootstrap-super-admin',
    authController.bootstrapSuperAdmin.bind(authController),
);
router.post('/create-user', authenticateToken, requireAdmin, authController.createUserByAdmin.bind(authController));
router.post('/login', authController.login.bind(authController));
router.post('/verify-otp', authController.verifyOtp.bind(authController));
router.post('/send-bank-edit-otp', authenticateToken, authController.sendBankEditOtp.bind(authController));
router.post('/verify-bank-edit-otp', authenticateToken, authController.verifyBankEditOtp.bind(authController));
router.post('/forgot-password', authController.forgotPassword.bind(authController));
router.post('/reset-password', authController.resetPassword.bind(authController));
router.post('/logout', authController.logout.bind(authController));


export default router;