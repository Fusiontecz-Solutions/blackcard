import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import syndicatorController from '../controllers/syndicatorController';

const router = express.Router();

router.use(authenticateToken);

router.get('/admin-summary', syndicatorController.adminSummary.bind(syndicatorController));

/** Authenticated-syndicator self lookup — must be registered before bare `/:id`. */
router.get('/me', syndicatorController.getMe.bind(syndicatorController));
router.get('/me/summary', syndicatorController.mySummary.bind(syndicatorController));
router.get(
  '/me/withdrawal-requests',
  syndicatorController.listMyWithdrawalRequests.bind(syndicatorController),
);
router.post(
  '/me/withdrawal-requests',
  syndicatorController.createMyWithdrawalRequest.bind(syndicatorController),
);

/** Prefer registering before bare `/:id` so numeric paths stay unambiguous */
router.get('/:id/wallet-transactions', syndicatorController.walletTransactions.bind(syndicatorController));
router.get(
  '/:id/withdrawal-requests',
  syndicatorController.listWithdrawalRequestsBySyndicatorId.bind(syndicatorController),
);
router.patch(
  '/:id/withdrawal-requests/:requestId',
  syndicatorController.reviewWithdrawalRequest.bind(syndicatorController),
);
router.post(
  '/:id/wallet-balance',
  syndicatorController.creditWalletBalance.bind(syndicatorController),
);

router.put(
  '/:id/syndicator-setting',
  syndicatorController.upsertSyndicatorSetting.bind(syndicatorController),
);
router.put(
  '/:id/payment-setting',
  syndicatorController.upsertSyndicatorPaymentSetting.bind(syndicatorController),
);
router.post(
  '/:id/bank-accounts',
  syndicatorController.createBankAccount.bind(syndicatorController),
);

router.get('/', syndicatorController.list.bind(syndicatorController));
router.post('/', syndicatorController.create.bind(syndicatorController));

router.get('/:id', syndicatorController.getById.bind(syndicatorController));
router.put('/:id', syndicatorController.update.bind(syndicatorController));
router.delete('/:id', syndicatorController.remove.bind(syndicatorController));

export default router;
