// import prisma from '../../config/prismaClient';
// import { QueryOptions } from "../../types/common";
// import { applicationSyndicatorDetailsRepository } from "./applicationSyndicatorDetailsRepository";
// import { syndicatorRepository } from "./syndicatorRepository";
// import applicationController from "../../controllers/applicationController";
// import sendMail from "../../config/nodemailer";

// export const applicationTransactionRepository = {
//   async create(data: any) {
//     const { applicationId } = data;

//     const transaction = await prisma.applicationTransaction.create({ data });

//     const application: any = await applicationController.getByApplicationId(Number(applicationId));

//     const isFailed = String(data.paymentType || "").toUpperCase() === "FAILED";

//     const msg = {
//       to: "info@fusiontecz.com",
//       // to: "prince11@fusiontecz.com",
//       from: process.env.EMAIL_FROM!,
//       subject: `Repayment Transaction Notification for Deal ${application.client.businessProfile?.businessName ?? ""} (${application.id})`,
//       text: `Repayment transaction notification for ${application.client.businessProfile?.businessName ?? ""} (${application.id})`,
//       html: `
//         <h1>${isFailed ? "Payment Failed" : "Payment Notification"}</h1>
//         <p>${isFailed ? "The transaction could not be completed. Below are the details:" : "We have received your payment. Below are the details:"}</p>
//         <p>Amount: $${Number(data.amount || 0).toFixed(2)}</p>
//         <p>Date: ${new Date(data.date || new Date()).toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
//         <p>Business name: ${application.client.businessProfile?.businessName ?? ""}</p>
//         <p>Category: ${data.category ?? ""}</p>
//         ${isFailed ? `<p>Please try again. If the issue persists, contact our support team.</p>` : ""}
//         <p>Thank you,</p>
//         <p>Fidi Funding LLC</p>
//       `,
//     };


//     if (String(data.paymentType || "").toUpperCase() === "FAILED") {
//       await emailService.sendEmail(msg);
//       return transaction;
//     }

//     const syndications = await applicationSyndicatorDetailsRepository.getByApplicationId(applicationId);

//     if (syndications && syndications?.length > 0) {
//       for (const syndication of syndications) {
//         const syndicatorId = syndication.syndicatorId;
//         const percentageSyndicated = syndication.percentageSyndicated;
//         const paybackAmountSyndicated = syndication.paybackAmountSyndicated;
//         const repaidAmount = data.amount;
//         const amountForSyndicator = (repaidAmount * Number(percentageSyndicated)) / 100;
//         const collectedAmount = Number(syndication.collectedAmount) + Number(amountForSyndicator);
//         const remainingAmount = Number(syndication.remainingAmount) - Number(amountForSyndicator);

//         const syndicatorWalletTransactionData = {
//           syndicatorId,
//           date: data.date,
//           applicationId,
//           merchantName: data.merchantName,
//           amount: amountForSyndicator,
//           paymentType: "CREDIT",
//           description: `${data.merchantName} Repaid`,
//           history_id: data.history_id,
//         };
//         await syndicatorRepository.updateSyndicatorWalletBalance(
//           syndicatorId,
//           syndicatorWalletTransactionData
//         );

//         await applicationSyndicatorDetailsRepository.updateSyndicatorDetailsById(
//           syndication.id,
//           {
//             ...syndication,
//             collectedAmount,
//             remainingAmount,
//           }
//         );
//       }
//     }
//     return transaction;
//   },

//   async updateTransactionByHistoryId(history_id: string, applicationId: number, data: any) {
//     const where: any = { history_id: String(history_id) };

//     const transaction = await prisma.applicationTransaction.findFirst({
//       where,
//       orderBy: { createdAt: "desc" },
//       take: 1,
//     });

//     if (!transaction) {
//       console.log("Transaction not found for history_id", history_id);
//       return;
//     }

//     const updatedTransaction = await prisma.applicationTransaction.update({
//       where: {
//         id: transaction.id,
//       },
//       data: {
//         ...transaction,
//         paymentType: data.paymentType,
//         description: data.description,
//         updatedAt: new Date(),
//       },
//     });

//     const application: any = await applicationController.getByApplicationId(Number(applicationId));

//     const isReturn = (String(data.paymentType || "").toUpperCase() === "RETURN") || (String(data.paymentType || "").toUpperCase() === "FAILED");

//     const msg = {
//       to: "info@fusiontecz.com",
//       // to: "prince11@fusiontecz.com",
//       from: process.env.EMAIL_FROM!,
//       subject: `${isReturn ? "Check Returned" : `${data.paymentType === "FAILED" ? "Payment Failed" : "Payment Notification"}`} for Deal ${application.client.businessProfile?.businessName ?? ""} (${application.id})`,
//       text: `${isReturn ? "Check Returned" : `${data.paymentType === "FAILED" ? "Payment Failed" : "Payment Notification"}`} for Deal ${application.client.businessProfile?.businessName ?? ""} (${application.id})`,
//       html: `
//         <h1>${isReturn ? "Check Returned" : `${data.paymentType === "FAILED" ? "Payment Failed" : "Payment Notification"}`}</h1>
//         <p>${isReturn ? "The check has been returned. Below are the details:" : `${data.paymentType === "FAILED" ? "The transaction could not be completed. Below are the details:" : "We have received your payment. Below are the details:"}`}</p>
//         <p>Amount: $${Number(updatedTransaction.amount || 0).toFixed(2)}</p>
//         <p>Date: ${new Date(updatedTransaction.date).toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
//         <p>Business name: ${application.client.businessProfile?.businessName ?? ""}</p>
//         <p>Category: ${updatedTransaction.category ?? ""}</p>
//         <p>Payment Type: ${updatedTransaction.paymentType ?? ""}</p>
//         <p>Description: ${updatedTransaction.description ?? ""}</p>
//         <p>Thank you,</p>
//         <p>Fidi Funding LLC</p>
//       `,
//     };


//     if (isReturn) {
//       await sendMail(msg);
//       // return updatedTransaction;
//     }

//     const syndications = await applicationSyndicatorDetailsRepository.getByApplicationId(applicationId);

//     if (syndications && syndications?.length > 0) {
//       for (const syndication of syndications) {
//         const syndicatorId = syndication.syndicatorId;
//         const percentageSyndicated = syndication.percentageSyndicated;
//         const paybackAmountSyndicated = syndication.paybackAmountSyndicated;
//         const repaidAmount = updatedTransaction.amount;
//         const amountForSyndicator = (Number(repaidAmount) * Number(percentageSyndicated)) / 100;
//         const collectedAmount = Number(syndication.collectedAmount) - Number(amountForSyndicator);
//         const remainingAmount = Number(syndication.remainingAmount) + Number(amountForSyndicator);

//         const txn = await prisma.syndicatorWalletTransaction.findFirst({
//           where: { history_id: String(history_id) },
//           orderBy: { createdAt: "desc" },
//           take: 1,
//         });
//         console.log(txn, "wallet transaction");

//         if (!txn) {
//           console.log("Wallet transaction not found for history_id", history_id);
//           continue;
//         }

//         const transaction = await prisma.syndicatorWalletTransaction.delete(
//           {
//             where: { id: txn?.id },
//           },
//         );

//         const syndicator = await prisma.syndicator.findUnique({
//           where: { id: syndicatorId },
//         });

//         const updatedSyndicator = await prisma.syndicator.update({
//           where: { id: syndicatorId },
//           data: {
//             ...syndicator,
//             currentBalance: Number(syndicator?.currentBalance) - Number(txn?.amount),
//           }
//         });
//         console.log(updatedSyndicator, "updated syndicator");

//         await applicationSyndicatorDetailsRepository.updateSyndicatorDetailsById(
//           syndication.id,
//           {
//             ...syndication,
//             collectedAmount,
//             remainingAmount,
//           }
//         );
//       }
//     }

//     return updatedTransaction;
//   },

//   async getAll() {
//     return await prisma.applicationTransaction.findMany({
//       orderBy: { date: "desc" },
//     });
//   },

//   async getByApplicationId(applicationId: number) {
//     const transactions = await prisma.applicationTransaction.findMany({
//       where: { applicationId },
//       orderBy: { createdAt: "desc" },
//     });

//     const applicationTermOffers = await prisma.termsOffer.findMany({
//       where: { applicationId },
//       orderBy: { createdAt: "desc" },
//     });

//     const termOffer = applicationTermOffers?.find((offer) => offer.status === "Accepted" || offer.status === "Sent" || offer.status === "Created");

//     let fundedAmount = termOffer?.approvedAmount;
//     let paybackAmount = termOffer?.paybackAmount;

//     const collectedAmount = transactions?.reduce((acc, txn) => {
//       if (txn.category === "REPAYMENT" && txn.paymentType === "CREDIT") {
//         return acc + Number(txn.amount);
//       }
//       return acc;
//     }, 0);
//     const remainingAmount = Number(paybackAmount) - Number(collectedAmount);
//     const content = {
//       txns: transactions,
//       txnStats: {
//         fundedAmount,
//         paybackAmount,
//         collectedAmount,
//         remainingAmount,
//       }
//     }


//     return content;
//   },

//   async getAllTxnsByApplicationId(applicationId: number) {
//     const where: any = { applicationId };

//     const transactions = await prisma.applicationTransaction.findMany({
//       where,
//     });

//     return transactions;
//   },

//   async createBalanceHistory(data: any) {
//     const balanceHistory = await prisma.applicationBalanceHistory.create({ data });
//     return balanceHistory;
//   },

//   async getApplicationBalanceHistory(applicationId: number, options: QueryOptions) {
//     const { offset, size, query, sortBy, orderBy } = options;
//     const pageSize = Math.max(1, size);

//     const where: any = { applicationId };
//     if (query && String(query).trim() !== "") {
//       where.merchantName = {
//         contains: String(query).trim(),
//         mode: "insensitive",
//       };
//     }

//     const [balanceHistory, total] = await prisma.$transaction([
//       prisma.applicationBalanceHistory.findMany({
//         take: pageSize,
//         skip: offset,
//         where,
//         orderBy: { [sortBy]: orderBy },
//       }),
//       prisma.applicationBalanceHistory.count({ where }),
//     ]);

//     const pages = Math.ceil(total / pageSize);
//     return { balanceHistory, total, pages };
//   },

//   async getLastBalanceHistoryTxn(applicationId: number) {
//     const where: any = { applicationId };

//     const balanceHistory = await prisma.applicationBalanceHistory.findFirst({
//       where,
//       orderBy: { balanceDate: "desc" },
//       take: 1,
//     });

//     return balanceHistory;
//   },

//   async getBalanceHistoryByHistoryId(history_id: string) {
//     const balanceHistory = await prisma.applicationBalanceHistory.findFirst({
//       where: { history_id: String(history_id) },
//     });
//     return balanceHistory;
//   },

//   async deleteBalanceHistoryById(id: number) {
//     const balanceHistory = await prisma.applicationBalanceHistory.delete({
//       where: { id },
//     });
//     return balanceHistory;
//   },
// };

// // Bro this file is very important.
// // This is the core repayment distribution logic of your system.

// // It basically handles 3 things:

// // 1️⃣ Recording repayment transactions
// // 2️⃣ Distributing repayment to syndicators
// // 3️⃣ Handling failed / returned payments