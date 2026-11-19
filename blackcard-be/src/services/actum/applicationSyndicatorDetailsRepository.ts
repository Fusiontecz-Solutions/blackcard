// import prisma from "../../config/prismaClient";
// import { QueryOptions } from "../../types/common";

// export const applicationSyndicatorDetailsRepository = {
//   async saveMany(details: any[]) {
//     return prisma.applicationSyndicatorDetails.createMany({
//       data: details,
//     });
//   },

//   async getByApplicationId(applicationId: number) {
//     return prisma.applicationSyndicatorDetails.findMany({
//       where: {
//         applicationId,
//       },
//     });
//   },

//   async updateSyndicatorDetailsById(id: number, data: any) {
//     return prisma.applicationSyndicatorDetails.update({
//       where: { id },
//       data,
//     });
//   },

//   async getAllSyndication() {
//     return prisma.applicationSyndicatorDetails.findMany({
//       where: {},
//     });
//   },

//   // async getBySyndicatorId(syndicatorId: number) {
//   //   const details = await prisma.applicationSyndicatorDetails.findMany({
//   //     where: { syndicatorId },
//   //   });

//   //   // Now fetch related applications manually
//   //   const applicationIds = details.map((d) => d.applicationId);

//   //   const applications = await prisma.application.findMany({
//   //     where: { id: { in: applicationIds } },
//   //   });

//   //   // Merge manually if needed
//   //   const merged = details.map((detail) => ({
//   //     ...detail,
//   //     application: applications.find((app) => app.id === detail.applicationId),
//   //   }));

//   //   return merged;
//   // },

//   // applicationSyndicatorDetailsRepository.ts

//   // async getBySyndicatorId(syndicatorId: number, page = 1, limit = 10) {
//   //   const offset = (page - 1) * limit;

//   //   // Step 1: Get total count
//   //   const totalItems = await prisma.applicationSyndicatorDetails.count({
//   //     where: { syndicatorId },
//   //   });

//   //   // Step 2: Get paginated details
//   //   const details = await prisma.applicationSyndicatorDetails.findMany({
//   //     where: { syndicatorId },
//   //     skip: offset,
//   //     take: limit,
//   //   });

//   //   // Step 3: Get all applicationIds
//   //   const applicationIds = details.map((d) => d.applicationId);

//   //   // Step 4: Fetch related data
//   //   const applications = await prisma.application.findMany({
//   //     where: { id: { in: applicationIds } },
//   //   });

//   //   const syndicate = await prisma.syndicate.findUnique({
//   //     where: { id: syndicatorId },
//   //   });

//   //   // Step 5: Merge full application + syndicate object
//   //   const merged = details.map((detail) => ({
//   //     ...detail,
//   //     application:
//   //       applications.find((app) => app.id === detail.applicationId) ?? null,
//   //     syndicate: syndicate ?? null,
//   //   }));

//   //   // Step 6: Return
//   //   return {
//   //     message: "Offer fetched Successfully.",
//   //     data: {
//   //       content: merged,
//   //       pagination: {
//   //         totalItems,
//   //         currentPage: page,
//   //         totalPages: Math.ceil(totalItems / limit),
//   //       },
//   //     },
//   //   };
//   // },

//   async getBySyndicatorId(syndicatorId: number) {
//     const details = await prisma.applicationSyndicatorDetails.findMany({
//       where: { syndicatorId },
//     });

//     // // Step 3: Get all applicationIds
//     // const applicationIds = details.map((d) => d.applicationId);

//     // // Step 4: Fetch related applications
//     // const applications = await prisma.application.findMany({
//     //   where: { id: { in: applicationIds } },
//     // });

//     // // Step 5: Fetch related termOffers by applicationId
//     // const termOffers = await prisma.termsOffer.findMany({
//     //   where: { applicationId: { in: applicationIds } },
//     // });

//     // // Step 6: Fetch syndicate info
//     // const syndicate = await prisma.syndicate.findUnique({
//     //   where: { id: syndicatorId },
//     // });

//     // // Step 7: Merge everything together
//     // const merged = details.map((detail) => {
//     //   const application = applications.find(
//     //     (app) => app.id === detail.applicationId
//     //   );
//     //   const termOffer = termOffers.find(
//     //     (offer) => offer.applicationId === detail.applicationId
//     //   );

//     //   return {
//     //     ...detail,
//     //     application: application
//     //       ? { ...application, termOffer: termOffer ?? null }
//     //       : null,
//     //     syndicate: syndicate ?? null,
//     //   };
//     // });

//     return details;
//   },
// };
