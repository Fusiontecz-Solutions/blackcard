// import prisma from '../../config/prismaClient';
// import cron from 'node-cron';
// import qs from 'qs';
// import axios, { AxiosRequestConfig } from "axios";
// // import { applicationSyndicatorDetailsService } from "./applicationSyndicatorDetailsService";
// import { applicationTransactionRepository } from "./applicationTransactionRepository";

// export const runRecurringPayments = async () => {
//   // const now = new Date();
//   // const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
//   // const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

//   const applications = await prisma.application.findMany({
//     where: {
//       currentQueue: 'FUNDED',
//       ScheduledRePayment: { none: {} },
//       // contract: {
//       //   startDate: {
//       //     gte: startOfToday,
//       //     lte: endOfToday,
//       //   },
//       // },
//       // termsOffer: {
//       //   some: { status: 'Accepted' },
//       // },
//     },
//     include: {
//       // contract: {
//       //   where: {
//       //     startDate: {
//       //       gte: startOfToday,
//       //       lte: endOfToday,
//       //     },
//       //   },
//       //   include: {
//       //     paymentBank: true,
//       //     paymentTerms: true,
//       //   },
//       // },
//       termsOffer: true,
//       client: {
//         select: {
//           businessProfile: {
//             select: {
//               businessName: true,
//               //   startDate: {
//               //     gte: startOfToday,
//               //     lte: endOfToday,
//               //   },
//               // },
//               // termsOffer: {
//               //   some: { status: 'Accepted' },
//               // },
//               businessEmail: true,
//               businessMobile: true,
//               address1: true,
//               address2: true,
//               city: true,
//               state: true,
//               zip: true,
//             },
//           },
//           bankInfo: true
//         },
//       },
//     },
//   });
//   // console.log(applications, "applications")

//   for (const app of applications) {
//     const offer = app.termsOffer[0];
//     const client = app.client;
//     const bankInfo = app.client.bankInfo?.[0] || [];
//     const paymentAmount = offer?.paymentAmount;
//     if (!offer || !client || !bankInfo || !paymentAmount) continue;

//     try {
//       await scheduleActumRepayment(app, offer, client, bankInfo);
//     } catch (err) {
//       console.error(`Failed to schedule repayment for application ${app.id}:`, err);
//     }
//   }
//   return applications;
// }

// // Parse Actum response function
// const parseActumResponse = async (responseStr: String) => {
//   // Remove leading and trailing spaces if any
//   const cleanResponse = responseStr.trim();
//   // Split the response by '&' and '=' to form key-value pairs
//   const keyValuePairs = cleanResponse.split("\n").filter(Boolean);
//   // Convert key-value pairs into an object
//   const responseJson = keyValuePairs.reduce(
//     (acc: Record<string, string>, line: string) => {
//       const [key, value] = line.split("=");
//       if (key && value) {
//         acc[key.trim()] = value.trim();
//       }
//       return acc;
//     },
//     {}
//   );

//   console.log(responseJson, "responseJson");
//   return responseJson;
// }

// export async function scheduleActumRepayment(
//   app: any,
//   offer: any,
//   client: any,
//   bankInfo?: any
// ) {
//   const merordernumber = `REPAYMENT-${app.id}`;
//   const billingCycle = {
//     "DAILY": 8,
//     "WEEKLY": 1,
//     "BIWEEKLY": 7
//   }
//   const daysTilRecur = offer.frequency === 'DAILY' ? 1 : offer.frequency === 'WEEKLY' ? 7 : offer.frequency === 'BIWEEKLY' ? 14 : 1;

//   const paymentAmount = Number(offer?.paymentAmount || 0);
//   const paymentAmountFormatted = paymentAmount.toFixed(2);
//   const applicationTransactions = await applicationTransactionRepository.getByApplicationId(app.id);

//   let collectedAmount = 0;
//   let remainingAmount = 0;
//   if (applicationTransactions?.txnStats?.remainingAmount > 0) {
//     remainingAmount = Number(applicationTransactions?.txnStats?.remainingAmount);
//     collectedAmount = Number(applicationTransactions?.txnStats?.collectedAmount);
//   }

//   if (remainingAmount <= 0) return;

//   const numberOfPayments = Math.ceil(remainingAmount / Number(paymentAmountFormatted));
//   console.log(remainingAmount, "remainingAmount", numberOfPayments, "numberOfPayments");

//   const data = qs.stringify({
//     parent_id: process.env.PARENT_ID,
//     sub_id: process.env.SUB_ID,
//     pmt_type: 'chk',
//     chk_acct: bankInfo?.accountNumber,
//     chk_aba: bankInfo?.routingNumber,
//     custname: `${client.businessProfile.businessName}`,
//     custphone: client.businessProfile.businessMobile,
//     // Actum expects amounts like "200.00", not "200"
//     initial_amount: paymentAmountFormatted,
//     // billing_cycle: 8,
//     billing_cycle: billingCycle[offer.frequency as keyof typeof billingCycle],
//     recur_amount: paymentAmountFormatted,
//     days_til_recur: daysTilRecur,
//     max_num_billing: numberOfPayments,
//     merordernumber,
//     currency: 'US',
//     // action_code: 'P',
//   });

//   // const config: AxiosRequestConfig = {
//   //   method: 'post',
//   //   url: 'https://join.actumprocessing.com/cgi-bin/dbs/man_trans.cgi',
//   //   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
//   //   data,
//   // };

//   // const res = await axios.request(config);
//   // console.log(res, res?.data, "res");

//   // if (res.status !== 200 || !res.data.includes('status=Accepted')) {
//   //   throw new Error(`Actum declined transaction: ${res.data}`);
//   // }

//   // if (res.status === 200 && res.data.includes('status=Accepted')) {
//   //   const parsedResponse = await parseActumResponse(res.data);
//   //   const transactionRes = await prisma.scheduledRePaymentTransaction.create({
//   //     data: {
//   //       status: parsedResponse?.status,
//   //       orderId: parsedResponse?.order_id,
//   //       historyId: parsedResponse?.history_id,
//   //       consumerUnique: parsedResponse?.consumer_unique,
//   //       authCode: parsedResponse?.authcode,
//   //       parentId: parsedResponse?.parent_id,
//   //       subId: parsedResponse?.sub_id,
//   //       paymentType: parsedResponse?.pmt_type,
//   //       customerName: parsedResponse?.custname,
//   //       customerPhone: parsedResponse?.custphone,
//   //       initialAmount: parseFloat(parsedResponse?.initial_amount),
//   //       billingCycle: parseInt(parsedResponse?.billing_cycle),
//   //       currency: parsedResponse?.currency,
//   //       merchantOrderNumber: parsedResponse?.merordernumber,
//   //       createdAt: new Date(),
//   //       updatedAt: new Date(),
//   //     }
//   //   })
//   //   console.log(transactionRes, "transactionRes")
//   // }

//   const scheduledRePaymentRes = await prisma.scheduledRePayment.create({
//     data: {
//       applicationId: app.id,
//       termOfferId: offer.id,
//       status: 'scheduled',
//       scheduledDate: new Date(),
//       orderRef: merordernumber,
//     },
//   });
//   console.log(scheduledRePaymentRes, "scheduledRePaymentRes")
// }
