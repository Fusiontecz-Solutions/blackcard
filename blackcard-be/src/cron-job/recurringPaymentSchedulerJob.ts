// import cron from "node-cron";
// import { runRecurringPayments } from "../services/actum/recurringPaymentScheduler";

// // Schedule the job to run every day at 20:06 PM IST
// cron.schedule('10 17 * * *',
//     async () => {
//         try {
//             await runRecurringPayments();
//         } catch (err) {
//             console.error("Error running recurring payment scheduler job:", err);
//         }
//     },
//     {
//         timezone: 'America/New_York'
//     }
// );
// console.log('Cron job scheduled for recurring payment scheduler at 05:10 PM every day.');

// // Borrower
// //    ↓
// // Scheduled repayment date
// //    ↓
// // Cron triggers
// //    ↓
// // runRecurringPayments()
// //    ↓
// // ACH debit request created
// //    ↓
// // Actum processes payment