// Note Type (for API responses)
export interface Note {
    _id: string;
    noteId?: number;
    content: string;
    application: string | {
        _id: string;
        applicationId?: number;
        priority?: string;
        type?: string;
        currentQueue?: string;
        currentState?: string;
    };
    createdBy: string | {
        _id: string;
        firstName?: string;
        lastName?: string;
        email?: string;
    };
    createdAt?: string;
    updatedAt?: string;
}

// Create Note Payload
export interface CreateNotePayload {
    content: string;
    application: string;
}

// Get Notes Params
export interface GetNotesParams {
    application?: string;
}

// API Response Types
export interface NoteResponse {
    success: boolean;
    message: string;
    data: Note;
}

export interface NotesListResponse {
    success: boolean;
    data: Note[];
}

export interface DeleteNoteResponse {
    success: boolean;
    message: string;
}

