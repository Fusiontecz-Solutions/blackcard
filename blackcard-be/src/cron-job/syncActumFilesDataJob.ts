// import cron from "node-cron";
// import fs from "fs";
// import path from "path";
// import { parse } from "csv-parse/sync";
// import prisma from "../config/prismaClient";
// import { applicationTransactionService } from "../services/actum/applicationTransactionService";

// interface SkippedTransactionData {
//     fileName: string;
//     applicationId: number;
//     merchantName?: string;
//     date: Date;
//     amount: number;
//     category?: string;
//     paymentType?: string;
//     description?: string;
//     orderNumber: string;
//     consumerUniqueID: string;
// }

// const LOCAL_DIR = path.join(__dirname, "../../../actum-files");

// // Helper: check if file is already processed in DB
// async function isFileProcessed(file: string, processedFiles: any[]) {
//     return processedFiles.some((processedFile) => processedFile.fileName === file);
// }

// // Helper: mark file as processed in DB
// async function markFileProcessed(filename: string) {
//     await prisma.processedActumFiles.create({
//         data: {
//             fileName: filename
//         }
//     });
// }

// // Parse file content and convert to JSON
// function parseTxtToJson(filePath: string): any[] {
//     const content = fs.readFileSync(filePath, "utf-8");

//     // Use csv-parse to convert to JSON array
//     const records = parse(content, {
//         columns: true,   // First row becomes keys
//         skip_empty_lines: true,
//         trim: true
//     });

//     return records;
// }

// // Parse Actum date format like 'JUL 11, 2025 02:06PM' into a Date object (local time)
// function parseActumDate(input: string | undefined | null): Date | null {
//     if (!input) return null;
//     const s = String(input).trim();
//     // Expected pattern: MMM DD, YYYY HH:MMAM/PM (month can be upper/mixed case)
//     const m = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
//     if (!m) return null;
//     const monthStr = m[1].toUpperCase();
//     const day = parseInt(m[2], 10);
//     const year = parseInt(m[3], 10);
//     let hour = parseInt(m[4], 10);
//     const minute = parseInt(m[5], 10);
//     const meridiem = m[6].toUpperCase();

//     const MONTHS: Record<string, number> = {
//         JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
//         JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
//     };
//     const month = MONTHS[monthStr];
//     if (month === undefined) return null;

//     if (hour === 12 && meridiem === 'AM') hour = 0;
//     else if (meridiem === 'PM' && hour !== 12) hour += 12;

//     const d = new Date(year, month, day, hour, minute, 0, 0);
//     // Validate constructed date (e.g., Feb 30 should be invalid)
//     if (
//         d.getFullYear() !== year ||
//         d.getMonth() !== month ||
//         d.getDate() !== day ||
//         d.getHours() !== hour ||
//         d.getMinutes() !== minute
//     ) {
//         return null;
//     }
//     return d;
// }

// async function addSkippedTransaction(record: SkippedTransactionData) {
//     const { applicationId, merchantName, date, amount, category, paymentType, description, orderNumber, consumerUniqueID, fileName } = record;
//     const skippedTran = await prisma.skippedActumTransactions.create({ data: { applicationId, merchantName, date, amount, category, paymentType, description, orderNumber, consumerUniqueID, fileName } });
//     return skippedTran;
// }

// // Main job
// async function processActumFiles() {
//     try {
//         const files = fs.readdirSync(LOCAL_DIR);

//         const processedFiles = await prisma.processedActumFiles.findMany();
//         console.log(files, "files");

//         for (const file of files) {
//             try {
//                 const filePath = path.join(LOCAL_DIR, file);

//                 // Only process .txt files
//                 if (!file.endsWith(".txt")) continue;

//                 // Check if processed
//                 if (await isFileProcessed(file, processedFiles)) {
//                     console.log(`Skipping already processed file: ${file}`);
//                     continue;
//                 }

//                 // Read & parse content
//                 const data = parseTxtToJson(filePath);

//                 for (const record of data) {
//                     if ((record as any)["MerchantOrderNumber"]?.split("-")[0] === "SYNDICATOR_WALLET_WITHDRAW") {
//                         continue;
//                     }

//                     const orderNumber = (record as any)["Order Number"];
//                     const consumerUniqueID = (record as any)["ConsumerUniqueID"];
//                     const appId = Number((record as any)["MerchantOrderNumber"]?.split("-")[1]);
//                     const merchantName = (record as any)["Consumer Name"] ?? "";
//                     const date = parseActumDate((record as any)["Transaction Date"]);
//                     const amount = parseFloat((record as any)["Amount"]);
//                     const transactionType = (record as any)["Transaction Type"] ?? "";
//                     const transactionResult = (record as any)["Transaction Result"] ?? "";
//                     const history_id = (record as any)["History KeyID"] ?? "";
//                     const referenceKeyID = (record as any)["Reference KeyID"] ?? "";
//                     const authorizationCode = (record as any)["Authorization Code"] ?? "";
//                     console.log(history_id, "history_id");
//                     console.log(referenceKeyID, "referenceKeyID");

//                     const transactionData = {
//                         applicationId: appId,
//                         merchantName: merchantName,
//                         date: date!,
//                         amount: amount,
//                         category: "REPAYMENT",
//                         paymentType: (transactionType === "Check Debit") && (transactionResult === "Approved") ? "CREDIT" : "FAILED",
//                         description: (transactionType === "Check Debit") && (transactionResult === "Approved") ? "Paid by " + merchantName : "Transaction Failed.",
//                         history_id: history_id,
//                     };

//                     if (!date || isNaN(date.getTime())) {
//                         console.warn("Skipping record due to invalid Transaction Date:", (record as any)["Transaction Date"], record);
//                         await addSkippedTransaction({ ...transactionData, orderNumber, consumerUniqueID, fileName: file });
//                         continue;
//                     }

//                     if (!appId) {
//                         console.warn("Skipping record due to invalid application id from MerchantOrderNumber:", (record as any)["MerchantOrderNumber"], record);
//                         await addSkippedTransaction({ ...transactionData, orderNumber, consumerUniqueID, fileName: file });
//                         continue;
//                     }

//                     try {
//                         if ((transactionType === "Check Debit") && (transactionResult === "Approved")) {
//                             console.log("Recording transaction for Check Debit and Approved", transactionData);
//                             await applicationTransactionService.recordTransaction(transactionData);
//                         } else if ((transactionType === "Check Return") && (transactionResult === "Return")) {
//                             console.log("Updating transaction for Check Return and Return", referenceKeyID, appId, "RETURN", authorizationCode);
//                             await applicationTransactionService.updateTransaction(referenceKeyID, appId, "RETURN", authorizationCode);
//                         } else if ((transactionType === "Check Settlement") && (transactionResult !== "Approved")) {
//                             console.log("Updating transaction for Check Settlement Failed", referenceKeyID, appId, "FAILED", "Check Settlement Failed.");
//                             await applicationTransactionService.updateTransaction(referenceKeyID, appId, "FAILED", "Check Settlement Failed.");
//                         } else if ((transactionType === "Check Debit") && (transactionResult !== "Approved")) {
//                             await applicationTransactionService.recordTransaction(transactionData);
//                         }
//                     } catch (recErr) {
//                         console.error("Error processing record. Skipping record and continuing.", { error: recErr, record });
//                         await addSkippedTransaction({ ...transactionData, orderNumber, consumerUniqueID, fileName: file });
//                         continue;
//                     }
//                 }

//                 // Mark file as processed
//                 await markFileProcessed(file);
//             } catch (fileErr) {
//                 console.error(`Error processing file ${file}. Skipping file and continuing.`, fileErr);
//                 // do not rethrow; continue with next file
//                 continue;
//             }
//         }
//     } catch (err) {
//         console.error("Error processing Actum files:", err);
//     }
// }

// // Schedule the job to run every day at 01:21 AM IST
// cron.schedule('00 09 * * *',
//     async () => {
//         try {
//             await processActumFiles();
//         } catch (err) {
//             console.error("Error running sync actum files job:", err);
//         }
//     },
//     {
//         timezone: 'America/New_York'
//     }
// );
// console.log('Cron job for sync actum files data scheduled for 13:51 PM every day.');

// // Client / Merchant
// //         ↓
// // ACH Debit (Actum)
// //         ↓
// // Platform receives repayment
// //         ↓
// // Application repayment recorded