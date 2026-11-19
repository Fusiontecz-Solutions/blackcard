// // import { syndicatorRepository } from "../services/actum/syndicatorRepository";
// import cron from "node-cron";

// cron.schedule('40 09 * * FRI',
//     async () => {
//         try {
//             await syndicatorRepository.getSyndicatorsForPayment();
//         } catch (err) {
//             console.error("Error running syndicator weekly payment job:", err);
//         }
//     },
//     {
//         timezone: 'America/New_York'
//     }
// );
// console.log('Cron job scheduled for syndicator weekly payment at 09:40 AM on Fridays');

// // Client / Merchant
// //        ↓
// // Repayment via Actum (ACH)
// //        ↓
// // Platform receives money
// //        ↓
// // Application transaction recorded
// //        ↓
// // Weekly cron calculates syndicator share
// //        ↓
// // Syndicator gets paid