import express from 'express';
import collectionPaymentController from '../controllers/collectionPaymentController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

router.use(authenticateToken);

router.get('/dashboard', collectionPaymentController.dashboard.bind(collectionPaymentController));
router.get(
  '/financial-overview/summary',
  collectionPaymentController.financialOverviewSummary.bind(collectionPaymentController),
);
router.get(
  '/dashboard/credit-debit-trend',
  collectionPaymentController.creditDebitTrend.bind(collectionPaymentController),
);
router.get(
  '/failed-transactions/summary',
  collectionPaymentController.failedTransactionsSummary.bind(collectionPaymentController),
);
router.get(
  '/failed-transactions',
  collectionPaymentController.failedTransactions.bind(collectionPaymentController),
);
router.get('/financials', collectionPaymentController.financials.bind(collectionPaymentController));
router.get(
  '/portfolio/merchants',
  collectionPaymentController.portfolioMerchants.bind(collectionPaymentController),
);
router.get(
  '/portfolio/deal/:ref',
  collectionPaymentController.portfolioDeal.bind(collectionPaymentController),
);
router.post(
  '/balances',
  collectionPaymentController.balancesForApplications.bind(collectionPaymentController),
);
router.post(
  '/by-application-ids',
  collectionPaymentController.listByApplicationIds.bind(collectionPaymentController),
);
router.get('/', collectionPaymentController.list.bind(collectionPaymentController));
router.post('/', collectionPaymentController.create.bind(collectionPaymentController));
router.patch(
  '/deal-economics',
  collectionPaymentController.updateDealEconomics.bind(collectionPaymentController),
);
router.put('/:id', collectionPaymentController.update.bind(collectionPaymentController));
router.delete('/:id', collectionPaymentController.delete.bind(collectionPaymentController));

export default router;
