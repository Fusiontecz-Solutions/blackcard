// import prisma from '../../config/prismaClient';
// import { QueryOptions } from "../../types/common";
// import axios, { AxiosRequestConfig } from "axios";
// import qs from 'qs';


// export const syndicatorRepository = {
//   // for application mapping dropdown
//   async findAllSyndicatorsWithoutSyndicateId() {
//     const syndicators = await prisma.syndicator.findMany({});
//     return syndicators;
//   },

//   // for table use
//   async findAllSyndicators(options: QueryOptions) {
//     const { offset, size, query, sortBy, orderBy } = options;
//     const pageSize = Math.max(1, size);

//     const [syndicators, total] = await prisma.$transaction([
//       prisma.syndicator.findMany({
//         take: pageSize,
//         skip: offset,
//         where: {
//           firstName: {
//             contains: query,
//             mode: "insensitive",
//           },
//         },
//         include: {
//           SyndicatorMember: true,
//         },
//         orderBy: {
//           [sortBy]: orderBy,
//         },
//       }),
//       prisma.syndicator.count({
//         where: {
//           firstName: {
//             contains: query,
//             mode: "insensitive",
//           },
//         },
//       }),
//     ]);
//     const pages = Math.ceil(total / pageSize);

//     const syndicatorsIds = syndicators.map((syndicator) => syndicator.id);
//     const applicationSyndicatorDetails = await prisma.applicationSyndicatorDetails.findMany({
//       select: {
//         id: true,
//         syndicatorId: true,
//         applicationId: true,
//         amountSyndicated: true,
//         paybackAmountSyndicated: true,
//         collectedAmount: true,
//         remainingAmount: true,
//         commissionAmount: true,
//         managementFeeToDate: true,
//       },
//       where: {
//         syndicatorId: { in: syndicatorsIds }
//       }
//     })

//     const syndicatorsWithAmounts = syndicators?.map((syndicator) => {
//       let totalAmountSyndicated = 0;
//       let totalPaybackAmountSyndicated = 0;
//       let totalCollectedAmount = 0;
//       let totalRemainingAmount = 0;
//       let totalCommissionAmount = 0;
//       let totalManagementFeeToDate = 0;
//       applicationSyndicatorDetails?.reduce((acc: any, detail: any) => {
//         if (detail.syndicatorId === syndicator.id) {
//           totalAmountSyndicated = totalAmountSyndicated + parseFloat(detail.amountSyndicated);
//           totalPaybackAmountSyndicated = totalPaybackAmountSyndicated + parseFloat(detail.paybackAmountSyndicated);
//           totalCollectedAmount = totalCollectedAmount + parseFloat(detail.collectedAmount);
//           totalRemainingAmount = totalRemainingAmount + parseFloat(detail.remainingAmount);
//           totalCommissionAmount = totalCommissionAmount + parseFloat(detail.commissionAmount);
//           totalManagementFeeToDate = totalManagementFeeToDate + parseFloat(detail.managementFeeToDate);
//         }
//       }, 0);

//       return {
//         ...syndicator,
//         totalAmountSyndicated,
//         totalPaybackAmountSyndicated,
//         totalCollectedAmount,
//         totalRemainingAmount,
//         totalCommissionAmount,
//         totalManagementFeeToDate,
//       };
//     });
//     return { syndicators: syndicatorsWithAmounts, total, pages };
//   },

//   async findSyndicatorById(syndicatorId: number) {
//     return prisma.syndicator.findUnique({
//       where: {
//         id: syndicatorId,
//       },
//     });
//   },

//   async findSyndicatorByuserId(userId: string) {
//     return prisma.syndicator.findUnique({
//       where: {
//         //@ts-ignore
//         userId,
//       },
//     });
//   },

//   async createSyndicator(syndicatorData: any) {
//     return prisma.syndicator.create({
//       data: { ...syndicatorData },
//     });
//   },

//   async updateSyndicatorById(syndicatorId: number, syndicatorData: any) {
//     return prisma.syndicator.update({
//       where: { id: syndicatorId },
//       data: { ...syndicatorData },
//     });
//   },

//   async deleteSyndicatorById(syndicatorId: number) {
//     return prisma.syndicator.delete({
//       where: {
//         id: syndicatorId,
//       },
//       include: {
//         users: true,
//         SyndicatorMember: true,
//       },
//     });
//   },

//   async fetchSyndicatorsByIds(syndicatorsIds: number[]) {
//     return prisma.syndicator.findMany({
//       where: {
//         id: { in: syndicatorsIds },
//       },
//     });
//   },

//   async deleteSyndicatorsByIds(syndicatorIds: number[]) {
//     return prisma.syndicator.deleteMany({
//       where: {
//         id: { in: syndicatorIds },
//       },
//     });
//   },

//   async createSyndicatorWalletTransaction(syndicatorId: number, walletBalanceData: any, prevBalance: number) {
//     const modifiedData = {
//       syndicatorId,
//       date: walletBalanceData.date,
//       ...(walletBalanceData?.applicationId && { applicationId: walletBalanceData.applicationId }),
//       ...(walletBalanceData?.merchantName && { merchantName: walletBalanceData.merchantName }),
//       prevBalance: prevBalance,
//       amount: walletBalanceData.amount,
//       paymentType: walletBalanceData.paymentType,
//       description: walletBalanceData.description,
//       history_id: walletBalanceData?.history_id ?? "",
//     }
//     const transaction = await prisma.syndicatorWalletTransaction.create({
//       data: modifiedData,
//     });
//     return transaction;
//   },

//   async updateSyndicatorWalletBalance(syndicatorId: number, walletBalanceData: any) {

//     const syndicator: any = await prisma.syndicator.findUnique({
//       where: { id: syndicatorId },
//     });

//     if (!syndicator) {
//       throw new Error("Syndicator not found");
//     }

//     const prevBalance = syndicator.currentBalance;
//     const transaction = await this.createSyndicatorWalletTransaction(syndicatorId, walletBalanceData, prevBalance);

//     let updatedBalance = 0;
//     if (walletBalanceData?.paymentType === "CREDIT" || walletBalanceData?.paymentType === "WALLET_CREDIT") {
//       updatedBalance = parseFloat(syndicator.currentBalance) + parseFloat(walletBalanceData?.amount);
//     } else if (walletBalanceData?.paymentType === "DEBIT" || walletBalanceData?.paymentType === "WITHDRAW") {
//       updatedBalance = syndicator.currentBalance - walletBalanceData?.amount;
//     } else {
//       throw new Error("Invalid wallet balance type");
//     }

//     const updatedSyndicator = await prisma.syndicator.update({
//       where: { id: syndicatorId },
//       data: {
//         ...syndicator,
//         currentBalance: updatedBalance,
//       }
//     });

//     return updatedSyndicator;
//   },

//   async getSyndicatorWalletTransactions(syndicatorId: number) {

//     const transactions = await prisma.syndicatorWalletTransaction.findMany({
//       where: {
//         syndicatorId,
//       }
//     });
//     return { transactions };
//   },

//   async getSyndicatorsForPayment() {
//     const syndicators = await prisma.syndicator.findMany({
//       select: {
//         id: true,
//         email: true,
//         phone: true,
//         firstName: true,
//         lastName: true,
//         address1: true,
//         city: true,
//         state: true,
//         zip: true,
//         SyndicatorPaymentSetting: true,
//         SyndicatorBankInformation: true,
//         SyndicatorSetting: true,
//       },
//       orderBy: {
//         id: "asc",
//       },
//     });
//     console.log(syndicators, "syndicators");

//     const now = new Date();
//     const currentDay = now.getDay();
//     const currentHour = now.getHours();

//     let daysSinceLastFriday = (currentDay + 7 - 5) % 7;

//     const isFridayBefore9AM = currentDay === 5 && currentHour < 9;
//     if (isFridayBefore9AM) {
//       daysSinceLastFriday += 7;
//     }

//     const lastFriday = new Date(now);
//     lastFriday.setDate(now.getDate() - daysSinceLastFriday);
//     lastFriday.setHours(9, 0, 0, 0);

//     const thisFriday = new Date(lastFriday);
//     thisFriday.setDate(lastFriday.getDate() + 7);

//     const endDate = now < thisFriday ? now : thisFriday;

//     console.log('Date range for filtering transactions:', { start: lastFriday, end: endDate });

//     for (const synd of syndicators) {
//       if (!synd?.SyndicatorBankInformation || synd?.SyndicatorBankInformation?.length === 0) {
//         continue;
//       }

//       const transactions = await prisma.syndicatorWalletTransaction.findMany({
//         where: {
//           syndicatorId: synd.id,
//           paymentType: "CREDIT",
//           createdAt: {
//             gte: lastFriday,
//             lte: endDate,
//           }
//         }
//       });

//       console.log(transactions, "synd transactions");

//       if (transactions?.length === 0) {
//         continue;
//       }

//       // if (synd.id !== 11) {
//       //   console.log("synd.id !== 11", synd.id);
//       //   continue;
//       // }

//       const totalAmount = transactions?.reduce((total, txn) => total + Number(txn.amount), 0) || 0;
//       console.log("totalAmount for", synd.firstName, totalAmount);

//       const merordernumber = `SYNDICATOR_WALLET_WITHDRAW-${synd.id}`;
//       const accountNumber = synd?.SyndicatorBankInformation?.[0]?.accountNumber;
//       const routingNumber = synd?.SyndicatorBankInformation?.[0]?.routingNumber;
//       const customerName = `${synd?.firstName} ${synd?.lastName}`;
//       const customerPhone = synd?.phone ?? "1234567890";

//       // Format amount to 2 decimal places as required by Actum
//       const formattedAmount = totalAmount.toFixed(2);

//       const data = qs.stringify({
//         parent_id: process.env.PARENT_ID,
//         sub_id: process.env.SUB_ID,
//         pmt_type: 'chk',
//         chk_acct: accountNumber,
//         chk_aba: routingNumber,
//         custname: customerName,
//         custphone: customerPhone,
//         // custaddress1: synd?.address1 || "N/A",  // Include address info (may be required based on merchant settings)
//         // custcity: synd?.city || "N/A",
//         // custstate: synd?.state || "N/A",
//         // custzip: synd?.zip || "00000",
//         initial_amount: formattedAmount,  // Use actual amount instead of test amount
//         // initial_amount: "100.00",
//         billing_cycle: "-1",  // One-time billing
//         currency: "US",
//         merordernumber: merordernumber,
//         action_code: "P",  // Required for credit transactions
//         creditflag: 1,  // THIS IS THE KEY FIX - indicates this is a CREDIT (sending money TO merchant)
//       });

//       console.log(data, "actum data");

//       // const config: AxiosRequestConfig = {
//       //   method: "post",
//       //   url: "https://join.actumprocessing.com/cgi-bin/dbs/man_trans.cgi",
//       //   headers: {
//       //     "Content-Type": "application/x-www-form-urlencoded",
//       //   },
//       //   data,
//       //   maxBodyLength: Infinity,
//       // };

//       // try {
//       //   const res = await axios.request(config);
//       //   console.log(res, res?.data, "actum res");

//       //   if (res.status !== 200 || !res.data.includes('status=Accepted')) {
//       //     console.error(`Actum declined transaction for ${customerName}: ${res.data}`);
//       //     continue;
//       //   }

//       //   // Parse response
//       //   const cleanResponse = res.data.trim();
//       //   const keyValuePairs = cleanResponse.split("\n").filter(Boolean);
//       //   const responseJson = keyValuePairs.reduce(
//       //     (acc: Record<string, string>, line: string) => {
//       //       const [key, value] = line.split("=");
//       //       if (key && value) {
//       //         acc[key.trim()] = value.trim();
//       //       }
//       //       return acc;
//       //     },
//       //     {}
//       //   );

//       //   // Create db entry for successful transaction
//       //   const syndicatorWalletTransactionData = {
//       //     syndicatorId: synd.id,
//       //     date: new Date(),
//       //     applicationId: "",
//       //     merchantName: "",
//       //     amount: 100.00,
//       //     paymentType: "WITHDRAW",
//       //     description: "Syndicator withdraw, weekly payments",
//       //   };

//       //   console.log(syndicatorWalletTransactionData, "syndicatorWalletTransactionData");
//       //   await this.updateSyndicatorWalletBalance(synd.id, syndicatorWalletTransactionData);

//       // } catch (error) {
//       //   console.error(`Error processing payment for ${customerName}:`, error);
//       //   continue;
//       // }
//     }

//     return syndicators;
//   },

//   // async checkCreditReserveBalance() {
//   //   const data = qs.stringify({
//   //     username: "",
//   //     password: "",
//   //     action_code: "B",
//   //     parent_id: process.env.PARENT_ID,
//   //   });

//   //   const config: AxiosRequestConfig = {
//   //     method: "post",
//   //     url: "https://join.actumprocessing.com/cgi-bin/dbs/man_trans.cgi",
//   //     headers: {
//   //       "Content-Type": "application/x-www-form-urlencoded",
//   //     },
//   //     data,
//   //     maxBodyLength: Infinity,
//   //   };

//   //   try {
//   //     const res = await axios.request(config);
//   //     console.log(res?.data, "actum check credit reserve balance res");

//   //     if (res.status !== 200 || !res.data.includes('status=Accepted')) {
//   //       console.error(`Error checking credit reserve balance:`, res.data);
//   //       return null;
//   //     }

//   //     // Parse response
//   //     const cleanResponse = res.data.trim();
//   //     const keyValuePairs = cleanResponse.split("\n").filter(Boolean);
//   //     const responseJson = keyValuePairs.reduce(
//   //       (acc: Record<string, string>, line: string) => {
//   //         const [key, value] = line.split("=");
//   //         if (key && value) {
//   //           acc[key.trim()] = value.trim();
//   //         }
//   //         return acc;
//   //       },
//   //       {}
//   //     );
//   //     return responseJson;
//   //   } catch (error) {
//   //     console.error(`Error checking credit reserve balance:`, error);
//   //     return null;
//   //   }
//   // }

//   // async saveApplicationSyndicatorDetails(details: any[]) {
//   //   return prisma.applicationSyndicatorDetails.createMany({
//   //     data: details,
//   //     skipDuplicates: false,
//   //   });
//   // },

//   // // Get all details by applicationId
//   // async getApplicationSyndicatorDetailsByApplicationId(applicationId: number) {
//   //   return prisma.applicationSyndicatorDetails.findMany({
//   //     where: { applicationId },
//   //   });
//   // },
// };