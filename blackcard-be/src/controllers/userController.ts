import type { Request, Response } from 'express';
import type { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '../config/prismaClient';
import { deleteUserAndLinkedSyndicator } from '../services/syndicatorDeletionService';
import * as userService from '../services/userService';
import { isValidRole } from '../constants/roles';

class UserController {
    // Create user (Admin only). Uses service layer with bcrypt.
    async create(req: Request, res: Response) {
        try {
            const { firstName, lastName, email, password, role, isActive, phone } = req.body;

            if (!firstName || !lastName || !email || !password || !role) {
                return res.status(400).json({
                    success: false,
                    message: 'firstName, lastName, email, password, and role are required',
                });
            }

            const normalizedRequestedRole = String(role).toUpperCase().replace(/-/g, '_');
            const actingRole = String((req as any).user?.role ?? '')
                .toUpperCase()
                .replace(/-/g, '_');
            if (normalizedRequestedRole === 'SUPER_ADMIN' && actingRole !== 'SUPER_ADMIN') {
                return res.status(403).json({
                    success: false,
                    message: 'Only Super Admin can assign the Super Admin role',
                });
            }

            const user = await userService.createUser({
                firstName,
                lastName,
                email,
                password,
                role,
                isActive,
                phone,
            });

            return res.status(201).json({
                success: true,
                message: 'User created successfully',
                data: {
                    _id: user.id,
                    id: user.id,
                    userId: user.userId,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    role: user.role,
                    isActive: user.isActive,
                    createdAt: user.createdAt,
                },
            });
        } catch (error: any) {
            const msg = error?.message || 'Internal server error';
            if (msg.includes('already exists') || msg.includes('email')) {
                return res.status(409).json({ success: false, message: msg });
            }
            if (msg.includes('Invalid') || msg.includes('required') || msg.includes('Password')) {
                return res.status(400).json({ success: false, message: msg });
            }
            console.error('Create user error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }
    // Get all users with optional role filter and pagination
    async getAll(req: Request, res: Response) {
        try {
            const { role } = req.query;

            // Build filter query - only filter by role if provided
            const filter: any = {};
            if (role) {
                // Normalize role to match Prisma enum (uppercase, underscores)
                const normalizedRole = String(role).toUpperCase().replace(/-/g, '_');

                // Validate against allowed roles to avoid Prisma validation errors
                if (!isValidRole(normalizedRole)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid role',
                    });
                }

                filter.role = normalizedRole;
            }

            const users = await prisma.user.findMany({
                where: filter,
                orderBy: { createdAt: 'desc' },
            });

            const shaped = users.map((user: any) => ({
                ...user,
                _id: user.id,
                password: undefined,
                otp: undefined,
                otpExpiry: undefined,
            }));

            console.log(`Get users by role: ${role}, found ${users.length} users`);

            return res.status(200).json({
                success: true,
                data: shaped,
            });
        } catch (error) {
            console.error('Get all users error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Get user by MongoDB ObjectId
    async getById(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const user = await prisma.user.findUnique({ where: { id } });

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            const shaped = {
                ...user,
                _id: user.id,
                password: undefined,
                otp: undefined,
                otpExpiry: undefined,
            };

            return res.status(200).json({
                success: true,
                data: shaped,
            });
        } catch (error) {
            console.error('Get user by ID error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Get user by numeric userId
    async getByUserId(req: Request, res: Response) {
        try {
            const { userId } = req.params;

            const user = await prisma.user.findUnique({ where: { userId: Number(userId) } });

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            const shaped = {
                ...user,
                _id: user.id,
                password: undefined,
                otp: undefined,
                otpExpiry: undefined,
            };

            return res.status(200).json({
                success: true,
                data: shaped,
            });
        } catch (error) {
            console.error('Get user by userId error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Update user
    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { firstName, lastName, email, phone, role, isActive, isVerified, profilePicture, password } = req.body;

            const user = await prisma.user.findUnique({ where: { id } });

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            // Check if email is being changed and if it already exists
            if (email && email !== user.email) {
                const existingUser = await prisma.user.findFirst({
                    where: {
                        email,
                        NOT: { id },
                    },
                });
                if (existingUser) {
                    return res.status(409).json({
                        success: false,
                        message: 'Email already in use by another user',
                    });
                }
            }

            let normalizedRoleUpdate: Role | undefined;
            if (role !== undefined) {
                const nr = String(role).toUpperCase().replace(/-/g, '_');
                const actingRole = String((req as any).user?.role ?? '')
                    .toUpperCase()
                    .replace(/-/g, '_');
                if (nr === 'SUPER_ADMIN' && actingRole !== 'SUPER_ADMIN') {
                    return res.status(403).json({
                        success: false,
                        message: 'Only Super Admin can assign the Super Admin role',
                    });
                }
                normalizedRoleUpdate = nr as Role;
            }

            let hashedPassword: string | undefined;
            if (password !== undefined && password !== null && String(password).length > 0) {
                if (String(password).length < 6) {
                    return res.status(400).json({
                        success: false,
                        message: 'Password must be at least 6 characters',
                    });
                }
                hashedPassword = await bcrypt.hash(String(password), 10);
            }

            // Update fields if provided
            const updatedUser = await prisma.user.update({
                where: { id },
                data: {
                    ...(firstName !== undefined && { firstName }),
                    ...(lastName !== undefined && { lastName }),
                    ...(email !== undefined && { email }),
                    ...(phone !== undefined && { phone }),
                    ...(normalizedRoleUpdate !== undefined && { role: normalizedRoleUpdate }),
                    ...(isActive !== undefined && { isActive }),
                    ...(isVerified !== undefined && { isVerified }),
                    ...(profilePicture !== undefined && { profilePicture }),
                    ...(hashedPassword !== undefined && { password: hashedPassword }),
                },
            });

            const shaped = {
                ...updatedUser,
                _id: updatedUser.id,
                password: undefined,
                otp: undefined,
                otpExpiry: undefined,
            };

            return res.status(200).json({
                success: true,
                message: 'User updated successfully',
                data: shaped,
            });
        } catch (error) {
            console.error('Update user error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Delete user (and linked Syndicator profile + syndication joins when applicable)
    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const existing = await prisma.user.findUnique({ where: { id } });
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            const actingUserId = (req as any).user?.id as string | undefined;
            await deleteUserAndLinkedSyndicator(id, actingUserId);

            return res.status(200).json({
                success: true,
                message: 'User deleted successfully',
            });
        } catch (error: any) {
            console.error('Delete user error:', error);
            const code = error?.code;
            const statusCode = error?.statusCode;
            if (code === 'P2025' || statusCode === 404) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }
            if (statusCode === 409) {
                return res.status(409).json({
                    success: false,
                    message: error?.message ?? 'Cannot delete user',
                });
            }
            return res.status(500).json({
                success: false,
                message:
                    process.env.NODE_ENV === 'development' ? error?.message ?? 'Internal server error' : 'Internal server error',
            });
        }
    }

    // Toggle user active status
    async toggleActive(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const user = await prisma.user.findUnique({ where: { id } });

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            const updatedUser = await prisma.user.update({
                where: { id },
                data: { isActive: !user.isActive },
            });

            const shaped = {
                ...updatedUser,
                _id: updatedUser.id,
                password: undefined,
                otp: undefined,
                otpExpiry: undefined,
            };

            return res.status(200).json({
                success: true,
                message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
                data: shaped,
            });
        } catch (error) {
            console.error('Toggle user active error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async impersonateUser(req: Request, res: Response) {
        try {

            const adminId = (req as any).user.id;
            const { userId } = req.body;

            const result = await userService.impersonateUserService(adminId, userId);

            const options = {
                expires: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
                httpOnly: true,
            };

            return res
                .cookie("token", result.token, options)
                .status(200)
                .json({
                    success: true,
                    ...result
                });

        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    };
}

const userController = new UserController();
export default userController;

