import { createSlice } from '@reduxjs/toolkit';
import {
    createNote,
    getNotes,
    deleteNote,
} from '../actions/noteActions';
import type { Note } from '@/types/noteTypes';

// State interface for notes list
interface NotesState {
    loading: boolean;
    data: Note[];
    error: string | null;
}

// State interface for single note operations
interface NoteState {
    loading: boolean;
    data: Note | null;
    error: string | null;
    success: boolean;
}

// State interface for delete operation
interface DeleteNoteState {
    loading: boolean;
    error: string | null;
    success: boolean;
    deletedId: string | null;
}

// Notes List Slice
export const notesSlice = createSlice({
    name: 'notes',
    initialState: {
        loading: false,
        data: [],
        error: null,
    } as NotesState,
    reducers: {
        clearNotesError: (state) => {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            // Get All Notes
            .addCase(getNotes.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getNotes.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
                state.error = null;
            })
            .addCase(getNotes.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Create Note Slice
export const createNoteSlice = createSlice({
    name: 'createNote',
    initialState: {
        loading: false,
        data: null,
        error: null,
        success: false,
    } as NoteState,
    reducers: {
        resetCreateNote: (state) => {
            state.loading = false;
            state.data = null;
            state.error = null;
            state.success = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(createNote.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.success = false;
            })
            .addCase(createNote.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
                state.error = null;
                state.success = true;
            })
            .addCase(createNote.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
                state.success = false;
            });
    },
});

// Delete Note Slice
export const deleteNoteSlice = createSlice({
    name: 'deleteNote',
    initialState: {
        loading: false,
        error: null,
        success: false,
        deletedId: null,
    } as DeleteNoteState,
    reducers: {
        resetDeleteNote: (state) => {
            state.loading = false;
            state.error = null;
            state.success = false;
            state.deletedId = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(deleteNote.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.success = false;
            })
            .addCase(deleteNote.fulfilled, (state, action) => {
                state.loading = false;
                state.error = null;
                state.success = true;
                state.deletedId = (action.payload as any).deletedId;
            })
            .addCase(deleteNote.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
                state.success = false;
            });
    },
});

// Export actions
export const { clearNotesError } = notesSlice.actions;
export const { resetCreateNote } = createNoteSlice.actions;
export const { resetDeleteNote } = deleteNoteSlice.actions;

