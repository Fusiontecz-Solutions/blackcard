export interface FinalAnswer {
    _id?: string;
    id?: string;
    application: string | {
        _id: string;
        id: string;
        applicationId: number;
        priority: string;
        type: string;
        currentQueue: string;
        currentState: string;
    };
    applicationId?: string;
    questionKey: string;
    questionLabel: string;
    answer: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface FetchFinalAnswersParams {
    applicationId: string;
}

export interface SaveFinalAnswerPayload {
    applicationId: string;
    questionKey: string;
    questionLabel: string;
    answer: string;
}

export interface SaveFinalAnswersPayload {
    applicationId: string;
    answers: {
        questionKey: string;
        questionLabel: string;
        answer: string;
    }[];
}

