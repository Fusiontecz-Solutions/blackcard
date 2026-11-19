import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';
import {
  APPLICATION_USER_ATTRIBUTION_ERROR,
  resolveApplicationAttributedUserId,
  resolveApplicationAttributedUserIdForActor,
} from '../middleware/authMiddleware';
import contractService from '../services/contractService';

class ContractController {
  async createContract(req: Request, res: Response) {
    try {
      const {
        clientId,
        applicationId,
        offerId,
        startDate,
        endDate,
        contractLenght,
        approvedAmount,
        totalAmount,
        status,
        createdById,
        agreementDate,
        paymentBankId,
        ...rest
      } = req.body;

      // Service derives many fields from applicationId:
      // client/user/ISO/offer values and amounts.
      if (!applicationId && (!offerId || !createdById)) {
        return res.status(400).json({
          success: false,
          message: 'Provide applicationId, or explicitly provide offerId + createdById',
        });
      }

      // Super Admin proxy / stale frontend ids are not tenant Users — resolve a real
      // User.id for Contract.createdById (same pattern as bank details / funding calls).
      let attributedCreatedById: string | null = null;
      if (applicationId) {
        const app = await prisma.application.findUnique({
          where: { id: String(applicationId) },
          select: { createdById: true, salesRepresentativeId: true },
        });
        if (!app) {
          return res.status(404).json({ success: false, message: 'Application not found' });
        }
        attributedCreatedById = await resolveApplicationAttributedUserId(req, {
          createdById: app.createdById,
          salesRepresentativeId: app.salesRepresentativeId,
        });
        if (!attributedCreatedById && createdById) {
          attributedCreatedById = await resolveApplicationAttributedUserIdForActor(
            String(createdById),
            {
              createdById: app.createdById,
              salesRepresentativeId: app.salesRepresentativeId,
            },
          );
        }
      } else if (createdById) {
        const user = await prisma.user.findUnique({
          where: { id: String(createdById) },
          select: { id: true },
        });
        attributedCreatedById = user?.id ?? null;
      }

      if (!attributedCreatedById) {
        return res.status(400).json({
          success: false,
          message: APPLICATION_USER_ATTRIBUTION_ERROR,
        });
      }

      const data = await contractService.createContract({
        clientId,
        applicationId,
        offerId,
        startDate,
        endDate,
        contractLenght: Number(contractLenght),
        approvedAmount: Number(approvedAmount),
        totalAmount: Number(totalAmount),
        status,
        createdById: attributedCreatedById,
        agreementDate,
        paymentBankId ,
        ...rest,
      });

      return res.status(201).json({ success: true, message: 'Contract created successfully', data });
    } catch (error: any) {
      console.error('Create contract error:', error);
      const statusCode = Number(error?.statusCode) || 500;
      return res.status(statusCode).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async getAllContracts(req: Request, res: Response) {
    try {
      const clientId = req.query.clientId as string | undefined;
      const applicationId = req.query.applicationId as string | undefined;
      const status = req.query.status as
        | 'DRAFT'
        | 'SENT'
        | 'VIEWED'
        | 'SIGNED'
        | 'COMPLETED'
        | 'DECLINED'
        | 'REVOKED'
        | 'EXPIRED'
        | undefined;

      const data = await contractService.getAllContracts({ clientId, applicationId, status });
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get contracts error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async getByIdContract(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id parameter' });

      const data = await contractService.getByIdContract(id);
      if (!data) return res.status(404).json({ success: false, message: 'Contract not found' });

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get contract by id error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async getContractRelatedDataByContractId(req: Request, res: Response) {
    try {
      const contractId = Number(req.params.contractId);
      if (isNaN(contractId)) {
        return res.status(400).json({ success: false, message: 'Invalid contractId parameter' });
      }

      const data = await contractService.getContractRelatedDataByContractId(contractId);
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get contract related data by contractId error:', error);
      const statusCode = error?.message === 'Contract not found' ? 404 : 500;
      return res.status(statusCode).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async getByApplicationIdContract(req: Request, res: Response) {
    try {
      const { applicationId } = req.params;
      if (!applicationId) {
        return res.status(400).json({ success: false, message: 'applicationId is required' });
      }

      const data = await contractService.getByApplicationIdContract(applicationId);
      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Contract not found for this applicationId',
        });
      }

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      const msg = error?.message || 'Internal server error';
      console.error(`Get contract by applicationId error: ${msg}`);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  async updateContract(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id parameter' });

      const existing = await contractService.getByIdContract(id);
      if (!existing) return res.status(404).json({ success: false, message: 'Contract not found' });

      const {
        clientId,
        applicationId,
        offerId,
        startDate,
        endDate,
        contractLenght,
        approvedAmount,
        totalAmount,
        status,
        createdById,
        agreementDate,
        paymentBankId,
        state,
        funderName,
        funder,
        contractPrefillOverrides,
        reverseDisbursementEnabled,
        reverseDisbursementSchedule,
        ...rest
      } = req.body;

      const resolvedFunderName =
        funderName !== undefined ? funderName : funder !== undefined ? funder : undefined;

      const data = await contractService.updateContract(id, {
        clientId,
        applicationId,
        offerId,
        startDate,
        endDate,
        contractLenght: contractLenght !== undefined ? Number(contractLenght) : undefined,
        approvedAmount: approvedAmount !== undefined ? Number(approvedAmount) : undefined,
        totalAmount: totalAmount !== undefined ? Number(totalAmount) : undefined,
        status,
        createdById,
        agreementDate,
        paymentBankId,
        state,
        funderName: resolvedFunderName,
        contractPrefillOverrides,
        reverseDisbursementEnabled:
          reverseDisbursementEnabled !== undefined
            ? reverseDisbursementEnabled === true || reverseDisbursementEnabled === 'true'
            : undefined,
        reverseDisbursementSchedule,
        ...rest,
      });

      return res.status(200).json({ success: true, message: 'Contract updated successfully', data });
    } catch (error: any) {
      console.error('Update contract error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async deleteContract(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id parameter' });

      const existing = await contractService.getByIdContract(id);
      if (!existing) return res.status(404).json({ success: false, message: 'Contract not found' });

      await contractService.deleteContract(id);
      return res.status(200).json({ success: true, message: 'Contract deleted successfully' });
    } catch (error: any) {
      console.error('Delete contract error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async createACH(req: Request, res: Response) {
    try {
      const {
        clientId,
        contractId,
        businessInfoId,
        bankName,
        accountHolderName,
        accountNumber,
        routingNumber,
        ach_authorization_bank_portal_website,
        ach_authorization_username,
        ach_authorization_password,
        ach_authorization_security_question1,
        ach_authorization_security_answer1,
        ach_authorization_security_question2,
        ach_authorization_security_answer2,
        ach_authorization_security_question3,
        ach_authorization_security_answer3,
        ach_authorization_other_infomation,
        ach_authorization_reference_name1,
        ach_authorization_reference_number_1,
        ach_authorization_reference_relationship1,
        ach_authorization_reference_name2,
        ach_authorization_reference_number2,
        ach_authorization_reference_relationship2,
        ach_authorization_reference_name3,
        ach_authorization_reference_number3,
        ach_authorization_reference_relationship3,
        paymentAmount,
        frequency,
        dba,
        phone,
        address,
        city,
        state,
        zip,
        bankBranchCity,
        bankState,
        bankZip,
      } = req.body;
      if (!clientId) {
        return res.status(400).json({ success: false, message: 'clientId is required' });
      }

      const data = await contractService.createACH({
        clientId,
        contractId: contractId !== undefined ? Number(contractId) : undefined,
        businessInfoId: businessInfoId !== undefined ? Number(businessInfoId) : undefined,
        bankName,
        accountHolderName,
        accountNumber,
        routingNumber,
        ach_authorization_bank_portal_website,
        ach_authorization_username,
        ach_authorization_password,
        ach_authorization_security_question1,
        ach_authorization_security_answer1,
        ach_authorization_security_question2,
        ach_authorization_security_answer2,
        ach_authorization_security_question3,
        ach_authorization_security_answer3,
        ach_authorization_other_infomation,
        ach_authorization_reference_name1,
        ach_authorization_reference_number_1,
        ach_authorization_reference_relationship1,
        ach_authorization_reference_name2,
        ach_authorization_reference_number2,
        ach_authorization_reference_relationship2,
        ach_authorization_reference_name3,
        ach_authorization_reference_number3,
        ach_authorization_reference_relationship3,
        paymentAmount,
        frequency,
        dba,
        phone,
        address,
        city,
        state,
        zip,
        bankBranchCity,
        bankState,
        bankZip,
      });

      return res.status(201).json({ success: true, message: 'Contract record created successfully', data });
    } catch (error: any) {
      console.error('Create contract error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async getAllACH(req: Request, res: Response) {
    try {
      const clientId = req.query.clientId as string | undefined;
      const contractId = req.query.contractId ? Number(req.query.contractId) : undefined;
      const data = await contractService.getAllACH({ clientId, contractId });
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get contracts error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async getByIdACH(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id parameter' });

      const data = await contractService.getByIdACH(id);
      if (!data) return res.status(404).json({ success: false, message: 'Contract record not found' });

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get contract error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async updateACH(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id parameter' });

      const existing = await contractService.getByIdACH(id);
      if (!existing) return res.status(404).json({ success: false, message: 'Contract record not found' });

      const {
        bankName,
        accountHolderName,
        accountNumber,
        routingNumber,
        ach_authorization_bank_portal_website,
        ach_authorization_username,
        ach_authorization_password,
        ach_authorization_security_question1,
        ach_authorization_security_answer1,
        ach_authorization_security_question2,
        ach_authorization_security_answer2,
        ach_authorization_security_question3,
        ach_authorization_security_answer3,
        ach_authorization_other_infomation,
        ach_authorization_reference_name1,
        ach_authorization_reference_number_1,
        ach_authorization_reference_relationship1,
        ach_authorization_reference_name2,
        ach_authorization_reference_number2,
        ach_authorization_reference_relationship2,
        ach_authorization_reference_name3,
        ach_authorization_reference_number3,
        ach_authorization_reference_relationship3,
        paymentAmount,
        frequency,
        clientId,
        contractId,
        businessInfoId,
        dba,
        phone,
        address,
        city,
        state,
        zip,
        bankBranchCity,
        bankState,
        bankZip,
      } = req.body;
      const data = await contractService.updateACH(id, {
        bankName,
        accountHolderName,
        accountNumber,
        routingNumber,
        ach_authorization_bank_portal_website,
        ach_authorization_username,
        ach_authorization_password,
        ach_authorization_security_question1,
        ach_authorization_security_answer1,
        ach_authorization_security_question2,
        ach_authorization_security_answer2,
        ach_authorization_security_question3,
        ach_authorization_security_answer3,
        ach_authorization_other_infomation,
        ach_authorization_reference_name1,
        ach_authorization_reference_number_1,
        ach_authorization_reference_relationship1,
        ach_authorization_reference_name2,
        ach_authorization_reference_number2,
        ach_authorization_reference_relationship2,
        ach_authorization_reference_name3,
        ach_authorization_reference_number3,
        ach_authorization_reference_relationship3,
        paymentAmount,
        frequency,
        clientId,
        contractId: contractId !== undefined ? Number(contractId) : undefined,
        businessInfoId: businessInfoId !== undefined ? Number(businessInfoId) : undefined,
        dba,
        phone,
        address,
        city,
        state,
        zip,
        bankBranchCity,
        bankState,
        bankZip,
      });

      return res.status(200).json({ success: true, message: 'Contract record updated successfully', data });
    } catch (error: any) {
      console.error('Update contract error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async deleteACH(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id parameter' });

      const existing = await contractService.getByIdACH(id);
      if (!existing) return res.status(404).json({ success: false, message: 'Contract record not found' });

      await contractService.deleteACH(id);
      return res.status(200).json({ success: true, message: 'Contract record deleted successfully' });
    } catch (error: any) {
      console.error('Delete contract error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async createEPO(req: Request, res: Response) {
    try {
      const {
        clientId,
        contractId,
        amountReceived1,
        receivedDate1,
        amountReceived2,
        receivedDate2,
        amountReceived3,
        receivedDate3,
      } = req.body;

      if (!clientId) {
        return res.status(400).json({ success: false, message: 'clientId is required' });
      }

      const data = await contractService.createEPO({
        clientId,
        contractId: contractId !== undefined ? Number(contractId) : undefined,
        amountReceived1,
        receivedDate1,
        amountReceived2,
        receivedDate2,
        amountReceived3,
        receivedDate3,
      });

      return res.status(201).json({ success: true, message: 'EPO record created successfully', data });
    } catch (error: any) {
      console.error('Create EPO error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async getAllEPO(req: Request, res: Response) {
    try {
      const clientId = req.query.clientId as string | undefined;
      const contractId = req.query.contractId ? Number(req.query.contractId) : undefined;
      const data = await contractService.getAllEPO({ clientId, contractId });
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get EPO records error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async getByIdEPO(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id parameter' });

      const data = await contractService.getByIdEPO(id);
      if (!data) return res.status(404).json({ success: false, message: 'EPO record not found' });

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get EPO by id error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async updateEPO(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id parameter' });

      const existing = await contractService.getByIdEPO(id);
      if (!existing) return res.status(404).json({ success: false, message: 'EPO record not found' });

      const {
        amountReceived1,
        receivedDate1,
        amountReceived2,
        receivedDate2,
        amountReceived3,
        receivedDate3,
        clientId,
        contractId,
      } = req.body;

      const data = await contractService.updateEPO(id, {
        amountReceived1,
        receivedDate1,
        amountReceived2,
        receivedDate2,
        amountReceived3,
        receivedDate3,
        clientId,
        contractId: contractId !== undefined ? Number(contractId) : undefined,
      });

      return res.status(200).json({ success: true, message: 'EPO record updated successfully', data });
    } catch (error: any) {
      console.error('Update EPO error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async deleteEPO(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id parameter' });

      const existing = await contractService.getByIdEPO(id);
      if (!existing) return res.status(404).json({ success: false, message: 'EPO record not found' });

      await contractService.deleteEPO(id);
      return res.status(200).json({ success: true, message: 'EPO record deleted successfully' });
    } catch (error: any) {
      console.error('Delete EPO error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async createAddendum(req: Request, res: Response) {
    try {
      const {
        clientId,
        contractId,
        businessInfoId,
        legalName1,
        dba1,
        typeOfEntity1,
        ein1,
        mailingAddress1,
        legalName2,
        dba2,
        typeOfEntity2,
        ein2,
        mailingAddress2,
        legalName3,
        dba3,
        typeOfEntity3,
        ein3,
        mailingAddress3,
        addendumDated,
        principalOwner,
        principalBusiness,
        businessLocation,
        principalState,
        principalOwnerAmount1,
        principalOwnerAmount2,
        principalOwner1Name,
        principalOwner1Date,
        principalOwner2Name,
        principalOwner2Date,
      } = req.body;

      if (!clientId) {
        return res.status(400).json({ success: false, message: 'clientId is required' });
      }

      const data = await contractService.createAddendum({
        clientId,
        contractId: contractId !== undefined ? Number(contractId) : undefined,
        businessInfoId: businessInfoId !== undefined ? Number(businessInfoId) : undefined,
        legalName1,
        dba1,
        typeOfEntity1,
        ein1,
        mailingAddress1,
        legalName2,
        dba2,
        typeOfEntity2,
        ein2,
        mailingAddress2,
        legalName3,
        dba3,
        typeOfEntity3,
        ein3,
        mailingAddress3,
        addendumDated,
        principalOwner,
        principalBusiness,
        businessLocation,
        principalState,
        principalOwnerAmount1,
        principalOwnerAmount2,
        principalOwner1Name,
        principalOwner1Date,
        principalOwner2Name,
        principalOwner2Date,
      });

      return res.status(201).json({ success: true, message: 'Addendum record created successfully', data });
    } catch (error: any) {
      console.error('Create Addendum error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async getAllAddendum(req: Request, res: Response) {
    try {
      const clientId = req.query.clientId as string | undefined;
      const contractId = req.query.contractId ? Number(req.query.contractId) : undefined;
      const data = await contractService.getAllAddendum({ clientId, contractId });
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get Addendum records error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async getByIdAddendum(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id parameter' });

      const data = await contractService.getByIdAddendum(id);
      if (!data) return res.status(404).json({ success: false, message: 'Addendum record not found' });

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get Addendum by id error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async updateAddendum(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id parameter' });

      const existing = await contractService.getByIdAddendum(id);
      if (!existing) return res.status(404).json({ success: false, message: 'Addendum record not found' });

      const {
        legalName1,
        dba1,
        typeOfEntity1,
        ein1,
        mailingAddress1,
        legalName2,
        dba2,
        typeOfEntity2,
        ein2,
        mailingAddress2,
        legalName3,
        dba3,
        typeOfEntity3,
        ein3,
        mailingAddress3,
        clientId,
        contractId,
        businessInfoId,
        addendumDated,
        principalOwner,
        principalBusiness,
        businessLocation,
        principalState,
        principalOwnerAmount1,
        principalOwnerAmount2,
        principalOwner1Name,
        principalOwner1Date,
        principalOwner2Name,
        principalOwner2Date,
      } = req.body;

      const data = await contractService.updateAddendum(id, {
        legalName1,
        dba1,
        typeOfEntity1,
        ein1,
        mailingAddress1,
        legalName2,
        dba2,
        typeOfEntity2,
        ein2,
        mailingAddress2,
        legalName3,
        dba3,
        typeOfEntity3,
        ein3,
        mailingAddress3,
        clientId,
        contractId: contractId !== undefined ? Number(contractId) : undefined,
        businessInfoId: businessInfoId !== undefined ? Number(businessInfoId) : undefined,
        addendumDated,
        principalOwner,
        principalBusiness,
        businessLocation,
        principalState,
        principalOwnerAmount1,
        principalOwnerAmount2,
        principalOwner1Name,
        principalOwner1Date,
        principalOwner2Name,
        principalOwner2Date,
      });

      return res.status(200).json({ success: true, message: 'Addendum record updated successfully', data });
    } catch (error: any) {
      console.error('Update Addendum error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async deleteAddendum(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id parameter' });

      const existing = await contractService.getByIdAddendum(id);
      if (!existing) return res.status(404).json({ success: false, message: 'Addendum record not found' });

      await contractService.deleteAddendum(id);
      return res.status(200).json({ success: true, message: 'Addendum record deleted successfully' });
    } catch (error: any) {
      console.error('Delete Addendum error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async createContractOwner(req: Request, res: Response) {
    try {
      const {
        contractId,
        firstName,
        lastName,
        email,
        phone,
        address,
        state,
        city,
        zip,
        ownershipPercentage,
      } = req.body;

      if (!contractId || !firstName) {
        return res.status(400).json({
          success: false,
          message: 'contractId and firstName are required',
        });
      }

      const data = await contractService.createContractOwner({
        contractId: Number(contractId),
        firstName: String(firstName).trim(),
        lastName: String(lastName ?? '').trim(),
        email,
        phone,
        address,
        state,
        city,
        zip,
        ownershipPercentage:
          ownershipPercentage !== undefined ? Number(ownershipPercentage) : undefined,
      });

      return res.status(201).json({
        success: true,
        message: 'Contract owner created successfully',
        data,
      });
    } catch (error: any) {
      console.error('Create contract owner error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async getAllContractOwners(req: Request, res: Response) {
    try {
      const contractId = req.query.contractId
        ? Number(req.query.contractId)
        : undefined;

      const data = await contractService.getAllContractOwners({ contractId });

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get contract owners error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async getByIdContractOwner(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid id parameter' });
      }

      const data = await contractService.getByIdContractOwner(id);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Contract owner not found' });
      }

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get contract owner by id error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async updateContractOwner(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid id parameter' });
      }

      const existing = await contractService.getByIdContractOwner(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Contract owner not found' });
      }

      const {
        contractId,
        firstName,
        lastName,
        email,
        phone,
        address,
        state,
        city,
        zip,
        ownershipPercentage,
      } = req.body;

      const data = await contractService.updateContractOwner(id, {
        contractId: contractId !== undefined ? Number(contractId) : undefined,
        firstName,
        lastName,
        email,
        phone,
        address,
        state,
        city,
        zip,
        ownershipPercentage:
          ownershipPercentage !== undefined ? Number(ownershipPercentage) : undefined,
      });

      return res.status(200).json({
        success: true,
        message: 'Contract owner updated successfully',
        data,
      });
    } catch (error: any) {
      console.error('Update contract owner error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async deleteContractOwner(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid id parameter' });
      }

      const existing = await contractService.getByIdContractOwner(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Contract owner not found' });
      }

      await contractService.deleteContractOwner(id);

      return res.status(200).json({
        success: true,
        message: 'Contract owner deleted successfully',
      });
    } catch (error: any) {
      console.error('Delete contract owner error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async createContractGuarantor(req: Request, res: Response) {
    try {
      const {
        contractId,
        firstName,
        lastName,
        email,
        phone,
        address,
        state,
        city,
        zip,
        ssn,
        driverLicense,
        entityType,
      } = req.body;

      if (!contractId || !firstName || !lastName) {
        return res.status(400).json({
          success: false,
          message: 'contractId, firstName and lastName are required',
        });
      }

      const data = await contractService.createContractGuarantor({
        contractId: Number(contractId),
        firstName,
        lastName,
        email,
        phone,
        address,
        state,
        city,
        zip,
        ssn,
        driverLicense,
        entityType,
      });

      return res.status(201).json({
        success: true,
        message: 'Contract guarantor created successfully',
        data,
      });
    } catch (error: any) {
      console.error('Create contract guarantor error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async getAllContractGuarantors(req: Request, res: Response) {
    try {
      const contractId = req.query.contractId
        ? Number(req.query.contractId)
        : undefined;

      const data = await contractService.getAllContractGuarantors({ contractId });

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get contract guarantors error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async getByIdContractGuarantor(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid id parameter' });
      }

      const data = await contractService.getByIdContractGuarantor(id);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Contract guarantor not found' });
      }

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get contract guarantor by id error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async updateContractGuarantor(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid id parameter' });
      }

      const existing = await contractService.getByIdContractGuarantor(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Contract guarantor not found' });
      }

      const {
        contractId,
        firstName,
        lastName,
        email,
        phone,
        address,
        state,
        city,
        zip,
        ssn,
        driverLicense,
        entityType,
      } = req.body;

      const data = await contractService.updateContractGuarantor(id, {
        contractId: contractId !== undefined ? Number(contractId) : undefined,
        firstName,
        lastName,
        email,
        phone,
        address,
        state,
        city,
        zip,
        ssn,
        driverLicense,
        entityType,
      });

      return res.status(200).json({
        success: true,
        message: 'Contract guarantor updated successfully',
        data,
      });
    } catch (error: any) {
      console.error('Update contract guarantor error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async deleteContractGuarantor(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid id parameter' });
      }

      const existing = await contractService.getByIdContractGuarantor(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Contract guarantor not found' });
      }

      await contractService.deleteContractGuarantor(id);

      return res.status(200).json({
        success: true,
        message: 'Contract guarantor deleted successfully',
      });
    } catch (error: any) {
      console.error('Delete contract guarantor error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async uploadContractDocuments(req: Request, res: Response) {
    try {
      const contractId = Number(req.params.id);
      if (isNaN(contractId)) {
        return res.status(400).json({ success: false, message: 'Invalid contract id parameter' });
      }

      const reqFiles = (req as any).files;
      if (!reqFiles || Object.keys(reqFiles).length === 0) {
        return res.status(400).json({ success: false, message: 'No files uploaded' });
      }

      const data = await contractService.uploadContractDocuments(contractId, reqFiles);

      return res.status(201).json({
        success: true,
        message: 'Contract documents uploaded successfully',
        data: data.documents ?? data,
        kycExtractions: data.kycExtractions ?? [],
      });
    } catch (error: any) {
      console.error('Upload contract documents error:', error);
      const statusCode = error?.message === 'Contract not found' ? 404 : 500;
      return res.status(statusCode).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async extractKycDocument(req: Request, res: Response) {
    try {
      const contractId = Number(req.params.id);
      if (isNaN(contractId)) {
        return res.status(400).json({ success: false, message: 'Invalid contract id parameter' });
      }

      const documentType = String(req.body?.documentType || '').trim();
      const reqFiles = (req as any).files;
      const file =
        reqFiles?.file ??
        reqFiles?.driverLicense ??
        reqFiles?.voidedCheck ??
        (reqFiles && Object.values(reqFiles)[0]);

      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded. Send multipart field file, driverLicense, or voidedCheck.',
        });
      }

      const data = await contractService.extractKycDocumentForContract(
        contractId,
        file,
        documentType,
      );

      return res.status(200).json({
        success: true,
        message: 'KYC document extracted and contract prefill updated',
        data,
      });
    } catch (error: any) {
      console.error('Extract KYC document error:', error);
      const msg = error?.message || 'Internal server error';
      const statusCode =
        msg === 'Contract not found'
          ? 404
          : msg.includes('documentType must be')
            ? 400
            : msg.includes('ANTHROPIC_API_KEY') || msg.includes('required for Claude')
              ? 503
              : 500;
      return res.status(statusCode).json({ success: false, message: msg });
    }
  }

  async syncKycPrefill(req: Request, res: Response) {
    try {
      const contractId = Number(req.params.id);
      if (isNaN(contractId)) {
        return res.status(400).json({ success: false, message: 'Invalid contract id parameter' });
      }

      const documentType = String(req.body?.documentType || '').trim();
      if (documentType !== 'driverLicense' && documentType !== 'voidedCheck') {
        return res.status(400).json({
          success: false,
          message: 'documentType must be driverLicense or voidedCheck',
        });
      }

      const data = await contractService.syncKycPrefillToContract(contractId, {
        documentType,
        contractPrefill:
          req.body?.contractPrefill && typeof req.body.contractPrefill === 'object'
            ? req.body.contractPrefill
            : {},
        panels:
          req.body?.panels && typeof req.body.panels === 'object' ? req.body.panels : {},
        keyData:
          req.body?.keyData && typeof req.body.keyData === 'object' ? req.body.keyData : {},
      });

      return res.status(200).json({
        success: true,
        message: 'Contract prefill updated from reviewed KYC extraction',
        data,
      });
    } catch (error: any) {
      console.error('Sync KYC prefill error:', error);
      const statusCode = error?.message === 'Contract not found' ? 404 : 500;
      return res.status(statusCode).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async getUploadedContractDocuments(req: Request, res: Response) {
    try {
      const contractId = Number(req.params.id);
      if (isNaN(contractId)) {
        return res.status(400).json({ success: false, message: 'Invalid contract id parameter' });
      }

      const data = await contractService.getUploadedContractDocuments(contractId);
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get uploaded contract documents error:', error);
      const statusCode = error?.message === 'Contract not found' ? 404 : 500;
      return res.status(statusCode).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async getUploadedContractDocumentById(req: Request, res: Response) {
    try {
      const contractId = Number(req.params.id);
      const { fileId } = req.params;

      if (isNaN(contractId)) {
        return res.status(400).json({ success: false, message: 'Invalid contract id parameter' });
      }

      if (!fileId) {
        return res.status(400).json({ success: false, message: 'fileId is required' });
      }

      const data = await contractService.getUploadedContractDocumentById(contractId, fileId);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Uploaded file not found' });
      }

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get uploaded contract document by id error:', error);
      const statusCode = error?.message === 'Contract not found' ? 404 : 500;
      return res.status(statusCode).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async updateUploadedContractDocument(req: Request, res: Response) {
    try {
      const contractId = Number(req.params.id);
      const { fileId } = req.params;
      const { fileName } = req.body;
      const file = (req as any).files?.file;

      if (isNaN(contractId)) {
        return res.status(400).json({ success: false, message: 'Invalid contract id parameter' });
      }

      if (!fileId) {
        return res.status(400).json({ success: false, message: 'fileId is required' });
      }

      if (!fileName && !file) {
        return res.status(400).json({
          success: false,
          message: 'Provide fileName or upload a replacement file',
        });
      }

      const data = await contractService.updateUploadedContractDocument(contractId, fileId, {
        fileName,
        file,
      });

      return res.status(200).json({
        success: true,
        message: 'Uploaded contract document updated successfully',
        data,
      });
    } catch (error: any) {
      console.error('Update uploaded contract document error:', error);
      const statusCode =
        error?.message === 'Contract not found'
          ? 404
          : error?.message === 'Uploaded file not found'
            ? 404
            : 500;
      return res.status(statusCode).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async deleteUploadedContractDocument(req: Request, res: Response) {
    try {
      const contractId = Number(req.params.id);
      const { fileId } = req.params;

      if (isNaN(contractId)) {
        return res.status(400).json({ success: false, message: 'Invalid contract id parameter' });
      }

      if (!fileId) {
        return res.status(400).json({ success: false, message: 'fileId is required' });
      }

      await contractService.deleteUploadedContractDocument(contractId, fileId);
      return res.status(200).json({
        success: true,
        message: 'Uploaded contract document deleted successfully',
      });
    } catch (error: any) {
      console.error('Delete uploaded contract document error:', error);
      const statusCode =
        error?.message === 'Contract not found'
          ? 404
          : error?.message === 'Uploaded file not found'
            ? 404
            : 500;
      return res.status(statusCode).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async getBoldSignTemplates(req: Request, res: Response) {
    try {
      const type = req.query.type as string | undefined;
      const state = req.query.state as string | undefined;
      const frequency = req.query.frequency as string | undefined;

      const data = await contractService.getAllBoldSignTemplates({
        type,
        state,
        frequency,
      });

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get BoldSign templates error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  async createContractDocumentTemplateMapping(req: Request, res: Response) {
    try {
      const contractId = Number(req.params.id);
      if (isNaN(contractId)) {
        return res.status(400).json({ success: false, message: 'Invalid contract id parameter' });
      }
      const { templateRef, documentType, order } = req.body || {};
      if (!templateRef || !documentType) {
        return res.status(400).json({ success: false, message: 'templateRef and documentType are required' });
      }
      const data = await contractService.createContractDocumentTemplateMapping({
        contractId,
        templateRef: String(templateRef),
        documentType: String(documentType),
        order: order !== undefined ? Number(order) : undefined,
      });
      return res.status(201).json({ success: true, message: 'Template mapping created', data });
    } catch (error: any) {
      console.error('Create contract template mapping error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async getAllContractDocumentTemplateMappings(req: Request, res: Response) {
    try {
      const contractId = Number(req.params.id);
      if (isNaN(contractId)) {
        return res.status(400).json({ success: false, message: 'Invalid contract id parameter' });
      }
      const data = await contractService.getAllContractDocumentTemplateMappings(contractId);
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Get contract template mappings error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async reorderContractDocumentTemplateMappings(req: Request, res: Response) {
    try {
      const contractId = Number(req.params.id);
      if (isNaN(contractId)) {
        return res.status(400).json({ success: false, message: 'Invalid contract id parameter' });
      }
      const { documentType, mappingIds } = req.body || {};
      if (!Array.isArray(mappingIds) || mappingIds.length === 0) {
        return res.status(400).json({ success: false, message: 'mappingIds must be a non-empty array' });
      }
      const data = await contractService.reorderContractDocumentTemplateMappings({
        contractId,
        documentType: documentType !== undefined ? String(documentType) : 'addendum',
        mappingIds: mappingIds.map((id: unknown) => String(id)),
      });
      if (!data) {
        return res.status(409).json({
          success: false,
          message: 'Template mappings changed — reload and try again',
        });
      }
      return res.status(200).json({ success: true, message: 'Template mappings reordered', data });
    } catch (error: any) {
      console.error('Reorder contract template mappings error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async updateContractDocumentTemplateMapping(req: Request, res: Response) {
    try {
      const { mappingId } = req.params;
      if (!mappingId) return res.status(400).json({ success: false, message: 'mappingId is required' });
      const { templateRef, documentType, order } = req.body || {};
      const data = await contractService.updateContractDocumentTemplateMapping(mappingId, {
        templateRef: templateRef !== undefined ? String(templateRef) : undefined,
        documentType: documentType !== undefined ? String(documentType) : undefined,
        order: order !== undefined ? Number(order) : undefined,
      });
      return res.status(200).json({ success: true, message: 'Template mapping updated', data });
    } catch (error: any) {
      console.error('Update contract template mapping error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async deleteContractDocumentTemplateMapping(req: Request, res: Response) {
    try {
      const { mappingId } = req.params;
      if (!mappingId) return res.status(400).json({ success: false, message: 'mappingId is required' });
      const contractId = Number(req.params.id);
      await contractService.deleteContractDocumentTemplateMapping(
        mappingId,
        Number.isFinite(contractId) ? contractId : undefined,
      );
      return res.status(200).json({ success: true, message: 'Template mapping deleted' });
    } catch (error: any) {
      console.error('Delete contract template mapping error:', error);
      return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
    }
  }

  async previewReverseDisbursementSchedule(req: Request, res: Response) {
    try {
      const contractId = Number(req.params.id);
      if (!Number.isFinite(contractId) || contractId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid contract id' });
      }

      const existing = await contractService.getByIdContract(contractId);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Contract not found' });
      }

      const bodySchedule = req.body?.reverseDisbursementSchedule;
      const useBody =
        bodySchedule != null &&
        typeof bodySchedule === 'object' &&
        !Array.isArray(bodySchedule);

      const pdfBuffer = await contractService.previewReverseDisbursementSchedulePdf(
        contractId,
        useBody ? bodySchedule : undefined,
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'inline; filename="disbursement-schedule-preview.pdf"',
      );
      return res.status(200).send(pdfBuffer);
    } catch (error: any) {
      console.error('Preview reverse disbursement schedule error:', error);
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to generate disbursement schedule preview',
      });
    }
  }
}






const contractController = new ContractController();
export default contractController;
