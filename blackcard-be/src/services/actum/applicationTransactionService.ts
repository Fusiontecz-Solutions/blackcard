// import { PaginationOptions } from "../../types/common";
// import { applicationTransactionRepository } from "./applicationTransactionRepository";

// interface CreateTransactionDto {
//   applicationId: number;
//   merchantName: string;
//   date: Date;
//   amount: number;
//   category: string;
//   paymentType: string;
//   description: string;
//   history_id?: string;
// }

// export const applicationTransactionService = {

//   async recordTransaction(data: CreateTransactionDto) {
//     if (!data) throw new Error("Transaction data is required");
//     if (!data.applicationId) throw new Error("Application ID is required");

//     const transaction = await applicationTransactionRepository.create(data);

//     if (data.paymentType === "CREDIT" && transaction) {
//       const lastBalanceHistory: any = await applicationTransactionRepository.getLastBalanceHistoryTxn(Number(data.applicationId));
//       const amountPaidToDate = Number(lastBalanceHistory.amountPaidToDate) + Number(data.amount);
//       const balance = Number(lastBalanceHistory.balance) - Number(data.amount);
//       const balanceWithFees = Number(lastBalanceHistory.balanceWithFees) - Number(data.amount);
//       const change = Number(data.amount);
//       const status = balance <= 0 ? "Paid Off" : "Healthy";

//       const balanceHistoryData = {
//         applicationId: Number(data.applicationId),
//         balanceDate: new Date(),
//         amountPaidToDate: amountPaidToDate,
//         balance: balance,
//         balanceWithFees: balanceWithFees,
//         change: change,
//         status: status,
//         history_id: String(data.history_id || ""),
//       }

//       await applicationTransactionRepository.createBalanceHistory(balanceHistoryData);
//     }

//     return transaction;
//   },

//   async updateTransaction(history_id: string, applicationId: number, paymentType: string, description: string) {
//     if (!history_id) throw new Error("History ID is required");
//     if (!applicationId) throw new Error("Application ID is required");
//     const transaction = await applicationTransactionRepository.updateTransactionByHistoryId(history_id, applicationId, {
//       paymentType,
//       description,
//     });

//     if ((paymentType === "RETURN" || paymentType === "FAILED") && transaction) {
//       const txn = await applicationTransactionRepository.getBalanceHistoryByHistoryId(history_id);
//       if (txn) {
//         await applicationTransactionRepository.deleteBalanceHistoryById(txn.id);
//       }
//     }

//     return transaction;
//   },

//   async fetchAll() {
//     return await applicationTransactionRepository.getAll();
//   },

//   async fetchByAppId(applicationId: number) {
//     const result = await applicationTransactionRepository.getByApplicationId(applicationId);
//     return result;
//   },

//   async getApplicationBalanceHistory(applicationId: number, options: PaginationOptions) {
//     const { page, size, query, sortBy, orderBy } = options;
//     const offset = (page - 1) * size;
//     const { balanceHistory, total, pages } = await applicationTransactionRepository.getApplicationBalanceHistory(applicationId, {
//       offset,
//       size,
//       query,
//       sortBy,
//       orderBy
//     });
//     return { balanceHistory, total, pages };
//   },
// };
