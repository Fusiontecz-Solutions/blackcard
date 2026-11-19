import express from 'express';
import contractController from '../controllers/contractController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

router.use(authenticateToken);

router.post('/create_contract', contractController.createContract.bind(contractController));
router.get('/get_all_contracts', contractController.getAllContracts.bind(contractController));
router.get('/get_contract/:id', contractController.getByIdContract.bind(contractController));
router.get('/get_contract_related/:contractId', contractController.getContractRelatedDataByContractId.bind(contractController));
router.get('/get_contract_by_application/:applicationId', contractController.getByApplicationIdContract.bind(contractController));
router.put('/update_contract/:id', contractController.updateContract.bind(contractController));
router.delete('/delete_contract/:id', contractController.deleteContract.bind(contractController));

router.post('/ach', contractController.createACH.bind(contractController));
router.get('/ach', contractController.getAllACH.bind(contractController));
router.get('/ach/:id', contractController.getByIdACH.bind(contractController));
router.put('/ach/:id', contractController.updateACH.bind(contractController));
router.delete('/ach/:id', contractController.deleteACH.bind(contractController));

router.post('/epo', contractController.createEPO.bind(contractController));
router.get('/epo', contractController.getAllEPO.bind(contractController));
router.get('/epo/:id', contractController.getByIdEPO.bind(contractController));
router.put('/epo/:id', contractController.updateEPO.bind(contractController));
router.delete('/epo/:id', contractController.deleteEPO.bind(contractController));

router.post('/addendum', contractController.createAddendum.bind(contractController));
router.get('/addendum', contractController.getAllAddendum.bind(contractController));
router.get('/addendum/:id', contractController.getByIdAddendum.bind(contractController));
router.put('/addendum/:id', contractController.updateAddendum.bind(contractController));
router.delete('/addendum/:id', contractController.deleteAddendum.bind(contractController));

router.post('/owner', contractController.createContractOwner.bind(contractController));
router.get('/owner', contractController.getAllContractOwners.bind(contractController));
router.get('/owner/:id', contractController.getByIdContractOwner.bind(contractController));
router.put('/owner/:id', contractController.updateContractOwner.bind(contractController));
router.delete('/owner/:id', contractController.deleteContractOwner.bind(contractController));

router.post('/guarantor', contractController.createContractGuarantor.bind(contractController));
router.get('/guarantor', contractController.getAllContractGuarantors.bind(contractController));
router.get('/guarantor/:id', contractController.getByIdContractGuarantor.bind(contractController));
router.put('/guarantor/:id', contractController.updateContractGuarantor.bind(contractController));
router.delete('/guarantor/:id', contractController.deleteContractGuarantor.bind(contractController));

router.post('/:id/documents/upload', contractController.uploadContractDocuments.bind(contractController));
router.post('/:id/documents/extract-kyc', contractController.extractKycDocument.bind(contractController));
router.post('/:id/documents/sync-kyc-prefill', contractController.syncKycPrefill.bind(contractController));
router.get('/:id/documents', contractController.getUploadedContractDocuments.bind(contractController));
router.get('/:id/documents/:fileId', contractController.getUploadedContractDocumentById.bind(contractController));
router.put('/:id/documents/:fileId', contractController.updateUploadedContractDocument.bind(contractController));
router.delete('/:id/documents/:fileId', contractController.deleteUploadedContractDocument.bind(contractController));
router.post('/:id/document-template-mappings', contractController.createContractDocumentTemplateMapping.bind(contractController));
router.get('/:id/document-template-mappings', contractController.getAllContractDocumentTemplateMappings.bind(contractController));
router.put('/:id/document-template-mappings-order', contractController.reorderContractDocumentTemplateMappings.bind(contractController));
router.put('/:id/document-template-mappings/:mappingId', contractController.updateContractDocumentTemplateMapping.bind(contractController));
router.delete('/:id/document-template-mappings/:mappingId', contractController.deleteContractDocumentTemplateMapping.bind(contractController));
router.post(
  '/:id/reverse-disbursement/preview',
  contractController.previewReverseDisbursementSchedule.bind(contractController),
);
router.get('/templates', contractController.getBoldSignTemplates.bind(contractController));

export default router;
