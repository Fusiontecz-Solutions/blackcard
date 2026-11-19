import express from 'express';
import reportController from '../controllers/reportController';
import { authenticateToken } from '../middleware/authMiddleware';
import { requireRoles } from '../middleware/requireRoles';

const router = express.Router();

/** Roles that can view reports / export / schedule / sync on book CRMs. */
const VIEW = requireRoles('ADMIN', 'SUPER_ADMIN', 'OPERATIONS', 'UNDERWRITER', 'ACCOUNTS', 'ACCOUNTANT');
const EXPORT = requireRoles('ADMIN', 'SUPER_ADMIN', 'OPERATIONS', 'ACCOUNTS', 'ACCOUNTANT');
const SCHEDULE = requireRoles('ADMIN', 'SUPER_ADMIN', 'OPERATIONS');
const SYNC = requireRoles('ADMIN', 'SUPER_ADMIN', 'OPERATIONS');

router.use(authenticateToken);

router.get('/options', VIEW, reportController.options.bind(reportController));
router.get('/overview', VIEW, reportController.overview.bind(reportController));
router.get('/books', VIEW, reportController.books.bind(reportController));
router.get('/cases', VIEW, reportController.cases.bind(reportController));
router.get('/contracts', VIEW, reportController.contracts.bind(reportController));
router.get('/funding', VIEW, reportController.funding.bind(reportController));
router.get('/daily', VIEW, reportController.daily.bind(reportController));
router.get('/team', VIEW, reportController.team.bind(reportController));
router.get('/applications', VIEW, reportController.applications.bind(reportController));
router.get('/collections', VIEW, reportController.collections.bind(reportController));
router.get('/payments', VIEW, reportController.payments.bind(reportController));

router.get('/export/:key', EXPORT, reportController.export.bind(reportController));

router.get('/sync/status', VIEW, reportController.syncStatus.bind(reportController));
router.post('/sync', SYNC, reportController.sync.bind(reportController));
router.post('/sync/rebuild-snapshots', SYNC, reportController.rebuildSnapshots.bind(reportController));

/** Used by Finexus org admin report sync (signed SA proxy → SUPER_ADMIN). */
router.get('/sa-export/applications', SYNC, reportController.saExportApplications.bind(reportController));
router.get('/sa-export/payments', SYNC, reportController.saExportPayments.bind(reportController));

router.get('/schedules', SCHEDULE, reportController.listSchedules.bind(reportController));
router.post('/schedules', SCHEDULE, reportController.createSchedule.bind(reportController));
router.put('/schedules/:id', SCHEDULE, reportController.updateSchedule.bind(reportController));
router.delete('/schedules/:id', SCHEDULE, reportController.deleteSchedule.bind(reportController));
router.post('/schedules/:id/run', SCHEDULE, reportController.runSchedule.bind(reportController));
router.get('/schedules/:id/preview', SCHEDULE, reportController.schedulePreview.bind(reportController));

router.get('/digest/sections', SCHEDULE, reportController.digestSections.bind(reportController));
router.post('/digest/preview', SCHEDULE, reportController.digestPreview.bind(reportController));
router.post('/digest/test', SCHEDULE, reportController.digestTest.bind(reportController));

router.get('/views', VIEW, reportController.listViews.bind(reportController));
router.post('/views', VIEW, reportController.createView.bind(reportController));
router.delete('/views/:id', VIEW, reportController.deleteView.bind(reportController));

export default router;
