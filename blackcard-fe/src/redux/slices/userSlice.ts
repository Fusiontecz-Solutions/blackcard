import { createSlice } from '@reduxjs/toolkit';
import type { User } from '@/types/userTypes';
import { fetchUsers, fetchUsersByRole } from '../actions/userActions';

// Users List State
interface UsersState {
    loading: boolean;
    data: User[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    } | null;
    error: string | null;
}

const usersInitialState: UsersState = {
    loading: false,
    data: [],
    pagination: null,
    error: null,
};

export const usersSlice = createSlice({
    name: 'users',
    initialState: usersInitialState,
    reducers: {
        clearUsers: (state) => {
            state.data = [];
            state.pagination = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchUsers.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchUsers.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
                state.pagination = action.payload.pagination || null;
            })
            .addCase(fetchUsers.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Users by Role State (for dropdowns like agents, sales reps)
interface UsersByRoleState {
    loading: boolean;
    agents: User[];
    salesReps: User[];
    admins: User[];
    error: string | null;
}

const usersByRoleInitialState: UsersByRoleState = {
    loading: false,
    agents: [],
    salesReps: [],
    admins: [],
    error: null,
};

export const usersByRoleSlice = createSlice({
    name: 'usersByRole',
    initialState: usersByRoleInitialState,
    reducers: {
        clearUsersByRole: (state) => {
            state.agents = [];
            state.salesReps = [];
            state.admins = [];
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchUsersByRole.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchUsersByRole.fulfilled, (state, action) => {
                state.loading = false;
                const { role, data } = action.payload;
                // Handle response structure: backend returns { success: true, data: [...] }
                // action.payload structure: { role: 'AGENT', data: { success: true, data: [...] } }
                let users = [];
                if (data?.success && Array.isArray(data.data)) {
                    users = data.data;
                } else if (Array.isArray(data?.data)) {
                    users = data.data;
                } else if (Array.isArray(data)) {
                    users = data;
                }

                // Debug: Log when agents are fetched (can be removed in production)
                if (role.toLowerCase() === 'agent') {
                    console.log('Agents fetched:', { count: users.length });
                }

                // Store users based on role
                switch (role.toLowerCase()) {
                    case 'agent':
                        state.agents = users;
                        break;
                    case 'sales_rep':
                    case 'salesrep':
                    case 'sales':
                        state.salesReps = users;
                        break;
                    case 'admin':
                        state.admins = users;
                        break;
                    default:
                        // For other roles, store in appropriate category
                        break;
                }
            })
            .addCase(fetchUsersByRole.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
                console.error('fetchUsersByRole rejected:', action.payload);
            });
    },
});

// Export actions
export const { clearUsers } = usersSlice.actions;
export const { clearUsersByRole } = usersByRoleSlice.actions;

