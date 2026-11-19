// @ts-nocheck
import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';
import type { AuthenticatedUser } from '../services/applicationService';
import { getUnderwriterClaimMutationDenial } from '../services/underwriterClaimGuard';
import { sanitizePaymentFrequencyForPersist } from '../utils/sanitizePaymentFrequency';

const mapTermsOfferToApi = (offer: any) => {
  if (!offer) return offer;

  const {
    id,
    termsOfferId,
    applicationId,
    createdById,
    approvedAmount,
    factorRate,
    paybackAmount,
    numberOfPayments,
    offerExpiryDate,
    termLength,
    commissionPercent,
    paymentAmount,
    percentOfGross,
    frequency,
    buyRate,
    commissionAmount,
    position,
    paymentSchedule,
    paymentDays,
    createdAt,
    updatedAt,
    ...rest
  } = offer;

  return {
    ...rest,
    _id: id,
    id,
    termsOfferId,
    approvedAmount,
    factorRate,
    paybackAmount,
    numberOfPayments,
    offerExpiryDate,
    termLength,
    commissionPercent,
    paymentAmount,
    percentOfGross,
    frequency,
    buyRate,
    commissionAmount,
    position,
    paymentSchedule,
    paymentDays,
    // Keep property names compatible with existing frontend code
    application: applicationId,
    createdBy: createdById,
    createdAt,
    updatedAt,
  };
};

const parseNumber = (value: string | number): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]+/g, '');
    return parseFloat(cleaned) || 0;
  }
  return 0;
};

const getUserRole = (req: Request): string | null => {
  const raw = (req as any).user?.role;
  if (!raw) return null;
  return String(raw).trim().toUpperCase().replace(/-/g, '_');
};

/** Prisma `Application.id` — must run before digit heuristics (UUIDs may start with 0–9). */
const APPLICATION_UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;

// Resolve application by numeric applicationId or UUID id
const findApplication = async (applicationIdOrUuid: unknown) => {
  const raw = Array.isArray(applicationIdOrUuid) ? applicationIdOrUuid[0] : applicationIdOrUuid;
  const str = raw != null && typeof raw !== 'object' ? String(raw).trim() : '';
  if (!str) return null;

  if (APPLICATION_UUID_RE.test(str)) {
    return prisma.application.findUnique({ where: { id: str } });
  }

  // Pure numeric => business `Application.applicationId`
  if (/^\d+$/.test(str)) {
    return prisma.application.findUnique({ where: { applicationId: Number(str) } });
  }

  return null;
};

const authUserFromReq = (req: Request): AuthenticatedUser | null =>
  (req as any).user?.id
    ? { id: String((req as any).user.id), role: String((req as any).user.role || '') }
    : null;

class TermsOfferController {
  // Create a new terms offer
  async create(req: Request, res: Response) {
    try {
      const {
        approvedAmount,
        factorRate,
        paybackAmount,
        numberOfPayments,
        offerExpiryDate,
        termLength,
        commissionPercent,
        paymentAmount,
        percentOfGross,
        frequency,
        buyRate,
        commissionAmount,
        position,
        paymentSchedule,
        paymentDays,
        application,
      } = req.body;

      if (
        !approvedAmount ||
        !factorRate ||
        !paybackAmount ||
        !numberOfPayments ||
        !offerExpiryDate ||
        !termLength ||
        !commissionPercent ||
        !paymentAmount ||
        !percentOfGross ||
        !frequency ||
        !buyRate ||
        !commissionAmount ||
        !position ||
        !paymentSchedule ||
        !application
      ) {
        return res.status(400).json({
          success: false,
          message: 'All required fields must be provided',
        });
      }

      const applicationExists = await findApplication(application);
      if (!applicationExists) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      const denyCreate = getUnderwriterClaimMutationDenial(authUserFromReq(req), applicationExists);
      if (denyCreate) {
        return res.status(denyCreate.status).json({ success: false, message: denyCreate.message });
      }

      const approvedAmountNum = parseNumber(approvedAmount);
      const factorRateNum = parseNumber(factorRate);
      const paybackAmountNum = parseNumber(paybackAmount);
      const numberOfPaymentsNum = parseNumber(numberOfPayments);
      const termLengthNum = parseNumber(termLength);
      const commissionPercentNum = parseNumber(commissionPercent);
      const paymentAmountNum = parseNumber(paymentAmount);
      const percentOfGrossNum = parseNumber(percentOfGross);
      const buyRateNum = parseNumber(buyRate);
      const commissionAmountNum = parseNumber(commissionAmount);

      const offerExpiryDateObj = new Date(offerExpiryDate);
      if (isNaN(offerExpiryDateObj.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid offer expiry date format',
        });
      }

      const validPaymentDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      const paymentDaysArray = Array.isArray(paymentDays)
        ? paymentDays.filter((day: string) => validPaymentDays.includes(day))
        : [];

      const createdBy = (req as any).user?.id;

      const newTermsOffer = await prisma.termsOffer.create({
        data: {
          approvedAmount: approvedAmountNum,
          factorRate: factorRateNum,
          paybackAmount: paybackAmountNum,
          numberOfPayments: numberOfPaymentsNum,
          offerExpiryDate: offerExpiryDateObj,
          termLength: termLengthNum,
          commissionPercent: commissionPercentNum,
          paymentAmount: paymentAmountNum,
          percentOfGross: percentOfGrossNum,
          frequency: sanitizePaymentFrequencyForPersist(frequency) || 'Daily',
          buyRate: buyRateNum,
          commissionAmount: commissionAmountNum,
          position,
          paymentSchedule,
          paymentDays: paymentDaysArray,
          applicationId: applicationExists.id,
          createdById: createdBy || null,
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Terms offer created successfully',
        data: mapTermsOfferToApi(newTermsOffer),
      });
    } catch (error) {
      console.error('Create terms offer error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Commission trend stats (commissionAmount per month), optionally filtered by createdAt date range
  async getCommissionTrend(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      const role = getUserRole(req);
      const userId = (req as any).user?.id as string | undefined;

      const where: any = {};

      // Agents see only their own created offers; elevated roles see all
      if (role === 'AGENT' && userId) {
        where.createdById = userId;
      }

      let createdAtFilter: { gte?: Date; lte?: Date } | undefined;

      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          start.setHours(0, 0, 0, 0);
          createdAtFilter = { ...(createdAtFilter || {}), gte: start };
        }
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          createdAtFilter = { ...(createdAtFilter || {}), lte: end };
        }
      }

      if (createdAtFilter) {
        where.createdAt = createdAtFilter;
      }

      const offers = await prisma.termsOffer.findMany({
        where,
        select: {
          commissionAmount: true,
          createdAt: true,
        },
      });

      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const buckets = MONTHS.map((name) => ({ name, value: 0 }));

      for (const offer of offers) {
        const created = offer.createdAt ? new Date(offer.createdAt) : null;
        if (!created || isNaN(created.getTime())) continue;
        const monthIndex = created.getMonth();
        if (monthIndex < 0 || monthIndex > 11) continue;

        const amt = offer.commissionAmount ?? 0;
        buckets[monthIndex].value += amt;
      }

      return res.status(200).json({
        success: true,
        data: buckets,
      });
    } catch (error) {
      console.error('Get commission trend error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get all terms offers with optional filters
  async getAll(req: Request, res: Response) {
    try {
      const { application } = req.query;

      const where: any = {};
      if (application) {
        const app = await findApplication(application);
        if (!app) {
          return res.status(200).json({
            success: true,
            data: [],
          });
        }
        where.applicationId = app.id;
      }

      const termsOffers = await prisma.termsOffer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: termsOffers.map(mapTermsOfferToApi),
      });
    } catch (error) {
      console.error('Get all terms offers error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get terms offer by Prisma UUID id
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const termsOffer = await prisma.termsOffer.findUnique({
        where: { id },
      });

      if (!termsOffer) {
        return res.status(404).json({
          success: false,
          message: 'Terms offer not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: mapTermsOfferToApi(termsOffer),
      });
    } catch (error) {
      console.error('Get terms offer by id error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get terms offer by numeric termsOfferId
  async getByTermsOfferId(req: Request, res: Response) {
    try {
      const { termsOfferId } = req.params;

      const termsOffer = await prisma.termsOffer.findUnique({
        where: { termsOfferId: Number(termsOfferId) },
      });

      if (!termsOffer) {
        return res.status(404).json({
          success: false,
          message: 'Terms offer not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: mapTermsOfferToApi(termsOffer),
      });
    } catch (error) {
      console.error('Get terms offer by termsOfferId error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Update terms offer
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        approvedAmount,
        factorRate,
        paybackAmount,
        numberOfPayments,
        offerExpiryDate,
        termLength,
        commissionPercent,
        paymentAmount,
        percentOfGross,
        frequency,
        buyRate,
        commissionAmount,
        position,
        paymentSchedule,
        paymentDays,
        application,
      } = req.body;

      const existing = await prisma.termsOffer.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Terms offer not found',
        });
      }

      const appForUw = await prisma.application.findUnique({
        where: { id: existing.applicationId },
        select: { currentQueue: true, claimedByUnderwriterId: true, assignedUnderwriterId: true, returnedToScrubberAt: true },
      });
      const denyUpdate = getUnderwriterClaimMutationDenial(authUserFromReq(req), appForUw);
      if (denyUpdate) {
        return res.status(denyUpdate.status).json({ success: false, message: denyUpdate.message });
      }

      const data: any = {};

      if (application) {
        const app = await findApplication(application);
        if (!app) {
          return res.status(404).json({
            success: false,
            message: 'Application not found',
          });
        }
        data.applicationId = app.id;
      }

      const parseOptNumber = (value: string | number | undefined): number | undefined =>
        value === undefined ? undefined : parseNumber(value as any);

      if (approvedAmount !== undefined) {
        const num = parseOptNumber(approvedAmount);
        if (num !== undefined) data.approvedAmount = num;
      }
      if (factorRate !== undefined) {
        const num = parseOptNumber(factorRate);
        if (num !== undefined) data.factorRate = num;
      }
      if (paybackAmount !== undefined) {
        const num = parseOptNumber(paybackAmount);
        if (num !== undefined) data.paybackAmount = num;
      }
      if (numberOfPayments !== undefined) {
        const num = parseOptNumber(numberOfPayments);
        if (num !== undefined) data.numberOfPayments = num;
      }
      if (offerExpiryDate !== undefined) {
        const dateObj = new Date(offerExpiryDate);
        if (isNaN(dateObj.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid offer expiry date format',
          });
        }
        data.offerExpiryDate = dateObj;
      }
      if (termLength !== undefined) {
        const num = parseOptNumber(termLength);
        if (num !== undefined) data.termLength = num;
      }
      if (commissionPercent !== undefined) {
        const num = parseOptNumber(commissionPercent);
        if (num !== undefined) data.commissionPercent = num;
      }
      if (paymentAmount !== undefined) {
        const num = parseOptNumber(paymentAmount);
        if (num !== undefined) data.paymentAmount = num;
      }
      if (percentOfGross !== undefined) {
        const num = parseOptNumber(percentOfGross);
        if (num !== undefined) data.percentOfGross = num;
      }
      if (frequency !== undefined) {
        const sanitized = sanitizePaymentFrequencyForPersist(frequency);
        if (sanitized != null) data.frequency = sanitized;
      }
      if (buyRate !== undefined) {
        const num = parseOptNumber(buyRate);
        if (num !== undefined) data.buyRate = num;
      }
      if (commissionAmount !== undefined) {
        const num = parseOptNumber(commissionAmount);
        if (num !== undefined) data.commissionAmount = num;
      }
      if (position !== undefined) data.position = position;
      if (paymentSchedule !== undefined) data.paymentSchedule = paymentSchedule;
      if (paymentDays !== undefined) {
        const validPaymentDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        data.paymentDays = Array.isArray(paymentDays)
          ? paymentDays.filter((day: string) => validPaymentDays.includes(day))
          : [];
      }

      const updated = await prisma.termsOffer.update({
        where: { id },
        data,
      });

      return res.status(200).json({
        success: true,
        message: 'Terms offer updated successfully',
        data: mapTermsOfferToApi(updated),
      });
    } catch (error) {
      console.error('Update terms offer error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Delete terms offer
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const offerRow = await prisma.termsOffer.findUnique({
        where: { id },
        select: { applicationId: true },
      });
      if (!offerRow) {
        return res.status(404).json({
          success: false,
          message: 'Terms offer not found',
        });
      }
      const appForUw = await prisma.application.findUnique({
        where: { id: offerRow.applicationId },
        select: { currentQueue: true, claimedByUnderwriterId: true, assignedUnderwriterId: true, returnedToScrubberAt: true },
      });
      const denyDelete = getUnderwriterClaimMutationDenial(authUserFromReq(req), appForUw);
      if (denyDelete) {
        return res.status(denyDelete.status).json({ success: false, message: denyDelete.message });
      }

      try {
        await prisma.termsOffer.delete({ where: { id } });
      } catch (err: any) {
        if (err.code === 'P2025') {
          return res.status(404).json({
            success: false,
            message: 'Terms offer not found',
          });
        }
        throw err;
      }

      return res.status(200).json({
        success: true,
        message: 'Terms offer deleted successfully',
      });
    } catch (error) {
      console.error('Delete terms offer error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}

const termsOfferController = new TermsOfferController();
export default termsOfferController;

