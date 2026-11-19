// import { PaginationOptions } from "../../types/common";
// import { NotFoundError, ValidationError } from "@/errors/index";
// import { applicationRepository } from "@/repositories/applicationRepository";
// import { ApplicationState } from "prisma/generated/client";
// import { applicationStateMachine } from "@/business/applicationStateMachine";
// import { clientService } from "./clientService";
// import { fileMetaDataService } from "./fileMetaDataService";

// export const applicationService = {
//   async fetchAllApplications(options: PaginationOptions) {
//     try {
//       const { page, size, query, sortBy, orderBy, filters } = options;
//       const offset = (page - 1) * size;

//       const { applications, total, pages } =
//         await applicationRepository.findAllApplications({
//           offset,
//           size,
//           query,
//           sortBy,
//           orderBy,
//           filters,
//         });

//       return { applications, total, pages };
//     } catch (error) {
//       throw error;
//     }
//   },

//   async fetchApplication(applicationId: number) {
//     try {
//       if (!applicationId)
//         throw new ValidationError(
//           "A valid Application ID is required to fetch the application."
//         );

//       const application =
//         await applicationRepository.findApplicationById(applicationId);

//       if (!application)
//         throw new NotFoundError(
//           `No application found with the ID: ${applicationId}. Please ensure the ID is correct.`
//         );

//       return application;
//     } catch (error) {
//       throw error;
//     }
//   },

//   async fetchApplicationsForClient(clientId: number) {
//     try {
//       if (!clientId)
//         throw new ValidationError(
//           "A valid Client ID is required to fetch the application."
//         );

//       const applications =
//         await applicationRepository.findAllApplicationsByClientId(clientId);

//       if (!applications) {
//         throw new NotFoundError(
//           `No applications found with the ID: ${clientId}. Please ensure the ID is correct.`
//         );
//       }
//       return applications;
//     } catch (error) {
//       throw error;
//     }
//   },

//   async createApplication(
//     userId: string | undefined,
//     data: any,
//     files: Express.Multer.File[]
//   ) {
//     try {
//       if (!userId || !data) {
//         throw new ValidationError("Application data or userId is missing.");
//       }

//       const updatedData = {
//         ...data,
//         createdById: userId,
//       };

//       const application =
//         await applicationRepository.createApplication(updatedData);

//       await fileMetaDataService.uploadFilesMetaData(
//         application.clientId,
//         files
//       );

//       return application;
//     } catch (error) {
//       throw error;
//     }
//   },

//   async updateApplication(applicationId: number, data: any) {
//     try {
//       if (!applicationId || !data) {
//         throw new ValidationError("Application ID and data are required.");
//       }
//       const application =
//         await applicationRepository.findApplicationById(applicationId);

//       if (!application) throw new NotFoundError("client not found.");

//       return await applicationRepository.updateApplicationById(
//         applicationId,
//         data
//       );
//     } catch (error) {
//       throw error;
//     }
//   },

//   async deleteApplication(applicationId: number) {
//     try {
//       if (!applicationId)
//         throw new ValidationError(
//           "A valid Application ID is required to fetch the application."
//         );

//       const application =
//         await applicationRepository.findApplicationById(applicationId);

//       if (!application)
//         throw new NotFoundError(
//           `No application found with the ID: ${applicationId}. Please ensure the ID is correct.`
//         );

//       return await applicationRepository.deleteApplicationById(applicationId);
//     } catch (error) {
//       throw error;
//     }
//   },

//   async deleteApplications(applicationsIds: number[]) {
//     try {
//       if (applicationsIds.length === 0) {
//         throw new ValidationError(
//           "Application IDs are required to delete applications."
//         );
//       }
//       const applications =
//         await applicationRepository.findApplicationsByIds(applicationsIds);

//       if (applications.length !== applicationsIds.length) {
//         throw new NotFoundError("Some applications were not found.");
//       }

//       return await applicationRepository.deleteApplicationsByIds(
//         applicationsIds
//       );
//     } catch (error) {
//       throw error;
//     }
//   },

//   async generateApplicationCreditReport(
//     userId: string,
//     applicationId: number,
//     ownerId: number
//   ) {
//     try {
//       await this.changeApplicationState(
//         applicationId,
//         "CREDIT_REPORT_REQUESTED",
//         userId
//       );

//       await clientService.generateCreditReport(ownerId);

//       await this.changeApplicationState(
//         applicationId,
//         "CREDIT_REPORT_RECEIVED",
//         userId
//       );
//     } catch (error) {
//       throw error;
//     }
//   },

//   async changeApplicationState(
//     applicationId: number,
//     newState: ApplicationState,
//     changedById: string,
//     reason?: string,
//     metadata?: object
//   ) {
//     try {
//       const application = await this.fetchApplication(applicationId);

//       const currentState = application.currentState;

//       // const isValidTransition =
//       //   applicationStateMachine.isValidTransition(newState);

//       // if (!isValidTransition) {
//       //   throw new ValidationError(
//       //     `Invalid transition from ${currentState} to ${newState}`
//       //   );
//       // }

//       const action = applicationStateMachine.transitions[currentState]?.find(
//         (transition) => transition.state === newState
//       )?.action;

//       // if (!action) {
//       //   throw new ValidationError("Action for state transition not found.");
//       // }

//       await applicationRepository.changeState(
//         applicationId,
//         currentState,
//         newState,
//         changedById,
//         action,
//         reason,
//         metadata
//       );

//       const updateData: {
//         currentState: ApplicationState;
//         currentQueue?: string;
//       } = {
//         currentState: newState,
//       };

//       if (newState === ApplicationState.APPROVED_UNDERWRITER) {
//         updateData.currentQueue = "CONTRACT";
//       }

//       if (newState === ApplicationState.REQUEST_FINAL_REVIEW) {
//         updateData.currentQueue = "FINAL_REVIEW";
//       }

//       if (newState === ApplicationState.FINAL_REVIEW_FINALIZED) {
//         updateData.currentQueue = "FUNDING_APPROVAL";
//       }

//       if (newState === ApplicationState.FUNDING_COMPLETED) {
//         updateData.currentQueue = "FUNDED";
//       }

//       const updatedApplication = await this.updateApplication(
//         applicationId,
//         updateData
//       );

//       return updatedApplication;
//     } catch (error) {
//       throw error;
//     }
//   },
// };
