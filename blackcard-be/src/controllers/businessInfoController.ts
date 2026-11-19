import type { Request, Response } from "express";
import prisma from "../config/prismaClient";

const mapBusinessInfoToApi = (info: any) => {
  if (!info) return null;

  return {
    id: info.id,
    state: info.state,
    funderName: info.funderName,
    frequency: info.frequency,
    clientBusinessName: info.clientBusinessName,
    clientBusinessEmail: info.clientBusinessEmail,
    payoff: info.payoff ?? "",
    addendum: Boolean(info.addendum),
    epo: Boolean(info.epo),
    ach: Boolean(info.ach),
    applicationId: info.applicationId,
  };
};

const resolveApplicationByAnyId = async (application: any) => {
  const applicationStr = String(application);

  // numeric legacy applicationId
  if (/^\d+$/.test(applicationStr)) {
    return prisma.application.findUnique({
      where: { applicationId: Number(applicationStr) },
    });
  }

  // assume UUID primary key
  return prisma.application.findUnique({
    where: { id: applicationStr },
  });
};

// class BusinessInfoController {
//   // GET /business-info/application/:applicationId
//   async getByApplication(req: Request, res: Response) {
//     try {
//       const { applicationId } = req.params;
//       if (!applicationId) {
//         return res.status(400).json({
//           success: false,
//           message: "applicationId is required",
//         });
//       }

//       const appRecord = await resolveApplicationByAnyId(applicationId);
//       if (!appRecord) {
//         return res.status(404).json({
//           success: false,
//           message: "Application not found",
//         });
//       }

//       const info = await prisma.businessInfo.findUnique({
//         where: { applicationId: appRecord.id },
//       });

//       return res.status(200).json({
//         success: true,
//         data: mapBusinessInfoToApi(info),
//       });
//     } catch (error: any) {
//       console.error("getByApplication businessInfo error:", error);
//       return res.status(500).json({
//         success: false,
//         message: error?.message || "Failed to fetch business info",
//       });
//     }
//   }

//   // POST /business-info/application/:applicationId
//   // Creates or updates the single BusinessInfo row for this applicationId.
//   async upsertByApplication(req: Request, res: Response) {
//     try {
//       const { applicationId } = req.params;
//       if (!applicationId) {
//         return res.status(400).json({
//           success: false,
//           message: "applicationId is required",
//         });
//       }

//       const {
//         state,
//         funderName,
//         frequency,
//         clientBusinessName,
//         clientBusinessEmail,
//         payoff,
//         addendum,
//         epo,
//         ach,
//       } = req.body ?? {};

//       // Required per spec / schema (allow payoff to be empty string)
//       if (
//         state == null ||
//         funderName == null ||
//         frequency == null ||
//         clientBusinessName == null ||
//         clientBusinessEmail == null
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "state, funderName, frequency, clientBusinessName, and clientBusinessEmail are required",
//         });
//       }

//       const appRecord = await resolveApplicationByAnyId(applicationId);
//       if (!appRecord) {
//         return res.status(404).json({
//           success: false,
//           message: "Application not found",
//         });
//       }

//       const payload = {
//         state: String(state).trim(),
//         funderName: String(funderName).trim(),
//         frequency: String(frequency).trim(),
//         clientBusinessName: String(clientBusinessName).trim(),
//         clientBusinessEmail: String(clientBusinessEmail).trim(),
//         // Ensure payoff is always a string (DocuSign logic expects .replace() when payoff !== "")
//         payoff:
//           payoff === undefined || payoff === null
//             ? ""
//             : String(payoff).trim(),
//         addendum: addendum === undefined || addendum === null ? false : Boolean(addendum),
//         epo: epo === undefined || epo === null ? false : Boolean(epo),
//         ach: ach === undefined || ach === null ? false : Boolean(ach),
//       };

//       const existing = await prisma.businessInfo.findUnique({
//         where: { applicationId: appRecord.id },
//         select: { id: true },
//       });

//       const result = await prisma.businessInfo.upsert({
//         where: { applicationId: appRecord.id },
//         create: {
//           ...payload,
//           applicationId: appRecord.id,
//         },
//         update: {
//           ...payload,
//         },
//       });

//       return res.status(existing ? 200 : 201).json({
//         success: true,
//         message: existing
//           ? "Business info updated successfully"
//           : "Business info created successfully",
//         data: mapBusinessInfoToApi(result),
//       });
//     } catch (error: any) {
//       console.error("upsertByApplication businessInfo error:", error);
//       return res.status(500).json({
//         success: false,
//         message: error?.message || "Failed to save business info",
//       });
//     }
//   }
// }

// const businessInfoController = new BusinessInfoController();
// export default businessInfoController;

