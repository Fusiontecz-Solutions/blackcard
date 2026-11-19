import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { forbidRoles } from '../middleware/forbidRoles';
import {
  analyzeDocument,
  recategorizeDocument,
  recategorizeAll,
  getCombined,
  getAnalyses,
  deleteAnalysis,
  setMcaTag,
  listMcaTags,
  listCategories,
} from '../controllers/aiAnalysisController';

const router = express.Router();

router.use(authenticateToken, forbidRoles('AGENT'));

// AI analysis CRUD
router.get('/:bankAnalysisId/ai-analyses', getAnalyses);
router.post('/:bankAnalysisId/ai-analyze', analyzeDocument);
router.post('/:bankAnalysisId/recategorize', recategorizeDocument);
router.post('/:bankAnalysisId/recategorize-all', recategorizeAll);
router.get('/:bankAnalysisId/ai-combined', getCombined);
router.delete('/:bankAnalysisId/ai-analyses/:analysisId', deleteAnalysis);

// MCA tags (global)
router.get('/mca-tags', listMcaTags);
router.post('/mca-tags', setMcaTag);
router.get('/categories', listCategories);

export default router;
