import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { sendCredentialMail } from '../config/nodemailer';
import prisma from '../config/prismaClient';
import type { Role } from '@prisma/client';
import { isValidRole, PUBLIC_REGISTER_ROLES, ROLES } from '../constants/roles';
import dotenv from 'dotenv';
import { sendWelcomeEmail } from '../services/emailService';
import { recordAuthAudit } from '../services/systemActivityLogService';

dotenv.config();

function timingSafeEqualUtf8(a: string, b: string): boolean {
    try {
        const ba = Buffer.from(a, 'utf8');
        const bb = Buffer.from(b, 'utf8');
        if (ba.length !== bb.length) return false;
        return crypto.timingSafeEqual(ba, bb);
    } catch {
        return false;
    }
}

const MIN_BOOTSTRAP_SECRET_LENGTH = 24;
const PASSWORD_POLICY_MESSAGE =
    'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.';

function validateStandardPassword(password: string): string | null {
    const value = String(password ?? '');
    if (value.length < 8) return PASSWORD_POLICY_MESSAGE;
    if (!/[A-Z]/.test(value)) return PASSWORD_POLICY_MESSAGE;
    if (!/[a-z]/.test(value)) return PASSWORD_POLICY_MESSAGE;
    if (!/[0-9]/.test(value)) return PASSWORD_POLICY_MESSAGE;
    if (!/[^A-Za-z0-9]/.test(value)) return PASSWORD_POLICY_MESSAGE;
    return null;
}

class AuthController {
    // sign up the user method
    async register(req: Request, res: Response) {
        try {
            const { firstName, lastName, email, password, role, phone } = req.body;
            if (!firstName || !lastName || !email || !password || !role) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required',
                });
            }

            // Normalize role to match Prisma `Role` enum (subset allowed for public registration)
            const normalizedRole = String(role).toUpperCase().replace(/-/g, '_');
            if (normalizedRole === 'SUPER_ADMIN') {
                return res.status(403).json({
                    success: false,
                    message:
                        'SUPER_ADMIN cannot be created via public registration. Use POST /auth/create-user (add your API prefix if any, e.g. /api/auth/create-user) with Authorization: Bearer <token>. Only a user with role SUPER_ADMIN can assign SUPER_ADMIN. You can send the same JSON including firstName, lastName, email, password, role, and phone.',
                });
            }
            const registerAllowed = new Set<string>(PUBLIC_REGISTER_ROLES);
            if (!registerAllowed.has(normalizedRole)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid role. Must be one of: ${PUBLIC_REGISTER_ROLES.join(', ')}`,
                });
            }

            const passwordValidationError = validateStandardPassword(password);
            if (passwordValidationError) {
                return res.status(400).json({
                    success: false,
                    message: passwordValidationError,
                });
            }

            // Step 2: Hash the password
            const hashedPassword = await bcrypt.hash(password, 10);
            // Step 3: Generate OTP
            const otp = crypto.randomInt(100000, 999999); // Generates a 6-digit OTP
            // Store expiry as seconds since epoch to fit in Int
            const otpExpiry = Math.floor(Date.now() / 1000) + 5 * 60; // expires in 5 minutes
            // Step 4: Check if user already exists (email is not the primary key, so use findFirst)
            const existingUser = await prisma.user.findFirst({ where: { email } });
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: 'User already exists',
                });
            }
            // Step 5: Create the user (only pass phone if provided)
            const userData: any = {
                firstName: String(firstName).trim(),
                lastName: String(lastName).trim(),
                email: String(email).trim().toLowerCase(),
                password: hashedPassword,
                role: normalizedRole,
                otp,
                otpExpiry,
            };
            if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
                userData.phone = String(phone).trim();
            }

            const user = await prisma.user.create({
                data: userData,
            });

            // Step 6: Send OTP to the user (don't fail registration if email fails)
            try {
                await sendCredentialMail(
                    email,
                    'IN-HOUSE CRM - Verify your account',
                    `
                    <h2>Email Verification Code</h2>
                    <p>Use the code below to verify your email:</p>
                    <p><strong>${otp}</strong></p>
                    <p>This code will expire in 5 minutes.</p>
                    `
                );
            } catch (mailErr) {
                console.error('Register: OTP email send failed (user was created):', mailErr);
            }

            return res.status(201).json({
                success: true,
                message: 'User registered successfully',
            });
        } catch (error: any) {
            console.error('Register error:', error);
            const message = error?.message || 'Internal server error';
            const code = error?.code;
            // Prisma errors: P2002 = unique constraint, P2003 = foreign key, etc.
            if (code === 'P2002') {
                return res.status(409).json({
                    success: false,
                    message: 'User with this email already exists',
                });
            }
            return res.status(500).json({
                success: false,
                message: process.env.NODE_ENV === 'development' ? message : 'Internal server error',
            });
        }
    }

    /** Admin-only: create user and send welcome email. Email is sent async (does not block response). */
    async createUserByAdmin(req: Request, res: Response) {
        try {
            const { name, firstName, lastName, email, phone, password, role, status } = req.body;

            const fTrim = firstName != null ? String(firstName).trim() : '';
            const lTrim = lastName != null ? String(lastName).trim() : '';
            const nameTrim = name != null ? String(name).trim() : '';

            let resolvedFirstName: string;
            let resolvedLastName: string;
            if (fTrim && lTrim) {
                resolvedFirstName = fTrim;
                resolvedLastName = lTrim;
            } else if (nameTrim) {
                const parts = nameTrim.split(/\s+/).filter(Boolean);
                resolvedFirstName = parts[0] ?? nameTrim;
                resolvedLastName = parts.slice(1).join(' ') || parts[0] || '';
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Provide `name`, or both `firstName` and `lastName`, along with email, password, and role',
                });
            }

            if (!email || !password || !role) {
                return res.status(400).json({
                    success: false,
                    message: 'Email, password and role are required',
                });
            }

            const normalizedRole = String(role).toUpperCase().replace(/-/g, '_');
            if (!isValidRole(normalizedRole)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid role. Must be one of: ${ROLES.join(', ')}`,
                });
            }

            const actingRole = String((req as any).user?.role ?? '')
                .toUpperCase()
                .replace(/-/g, '_');
            if (normalizedRole === 'SUPER_ADMIN' && actingRole !== 'SUPER_ADMIN') {
                return res.status(403).json({
                    success: false,
                    message: 'Only Super Admin can assign the Super Admin role',
                });
            }

            const emailStr = String(email).trim().toLowerCase();
            const existingUser = await prisma.user.findFirst({ where: { email: emailStr } });
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: 'A user with this email already exists',
                });
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailStr)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email format',
                });
            }

            const adminPasswordValidationError = validateStandardPassword(String(password));
            if (adminPasswordValidationError) {
                return res.status(400).json({
                    success: false,
                    message: adminPasswordValidationError,
                });
            }

            const hashedPassword = await bcrypt.hash(String(password), 10);

            const isActive = status !== undefined ? Boolean(status) : true;

            const createSyndicatorProfile =
                normalizedRole === 'SYNDICATOR' && req.body.createSyndicatorProfile !== false;

            const user = await prisma.$transaction(async (tx) => {
                const created = await tx.user.create({
                    data: {
                        firstName: resolvedFirstName,
                        lastName: resolvedLastName,
                        email: emailStr,
                        password: hashedPassword,
                        role: normalizedRole as Role,
                        isActive,
                        otp: 0,
                        otpExpiry: 0,
                        ...(phone !== undefined &&
                            phone !== null &&
                            String(phone).trim() !== '' && { phone: String(phone).trim() }),
                    },
                });

                if (createSyndicatorProfile) {
                    const existingProfile = await tx.syndicator.findFirst({
                        where: {
                            OR: [{ email: emailStr }, { userId: created.id }],
                        },
                    });
                    if (existingProfile) {
                        throw Object.assign(new Error('Syndicator profile already exists for this email or account'), {
                            code: 'SYNDICATOR_CONFLICT',
                        });
                    }

                    await tx.syndicator.create({
                        data: {
                            firstName: resolvedFirstName,
                            lastName: resolvedLastName || null,
                            email: emailStr,
                            phone:
                                phone !== undefined && phone !== null && String(phone).trim() !== ''
                                    ? String(phone).trim()
                                    : null,
                            userId: created.id,
                            role: 'PARTICIPANT',
                            address1: 'N/A',
                            city: 'N/A',
                            state: 'N/A',
                            zip: 'N/A',
                        },
                    });
                }

                return created;
            });

            // Send welcome email asynchronously (do not block response)
            const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || emailStr;
            const loginUrl = process.env.APP_LOGIN_URL || 'https://app.inhousecrm.com/login';
            setImmediate(() => {
                void sendWelcomeEmail({
                    to: user.email,
                    name: displayName,
                    role: normalizedRole,
                    temporaryPassword: String(password),
                    loginUrl,
                });
            });

            const shaped = {
                _id: user.id,
                id: user.id,
                userId: user.userId,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isActive: user.isActive,
                createdAt: user.createdAt,
            };

            return res.status(201).json({
                success: true,
                message: 'User created successfully',
                data: shaped,
            });
        } catch (error: any) {
            console.error('Create user (admin) error:', error);
            const code = error?.code;
            if (code === 'P2002') {
                return res.status(409).json({
                    success: false,
                    message: 'User with this email already exists',
                });
            }
            if (code === 'SYNDICATOR_CONFLICT') {
                return res.status(409).json({
                    success: false,
                    message: error?.message ?? 'Syndicator profile conflict',
                });
            }
            return res.status(500).json({
                success: false,
                message: error?.message || 'Internal server error',
            });
        }
    }

    async login(req: Request, res: Response) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required',
                });
            }

            const normalizedEmail = String(email).trim().toLowerCase();
            const user = await prisma.user.findFirst({ where: { email: normalizedEmail } });
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            if (user.isActive === false) {
                return res.status(403).json({
                    success: false,
                    message: 'Account is deactivated',
                });
            }

            if (!user.isVerified) {
                const nowSec = Math.floor(Date.now() / 1000);
                const otpExpirySec = user.otpExpiry;
                if (user.otp !== 0 && nowSec < otpExpirySec) {
                    return res.status(400).json({
                        success: false,
                        message: 'User is not verified',
                        isVerified: false,
                        userId: user.id,
                    });
                } else if (user.otp !== 0 && nowSec > otpExpirySec) {
                    const otp = crypto.randomInt(100000, 999999); // Generates a 6-digit OTP
                    const otpExpiry = Math.floor(Date.now() / 1000) + 5 * 60; // OTP expires in 5 minutes

                    await prisma.user.update({
                        where: { id: user.id },
                        data: { otp, otpExpiry },
                    });

                    try {
                        await sendCredentialMail(
                            user.email,
                            'IN-HOUSE CRM - Verify your account',
                            `
                        <h2>Email Verification Code</h2>
                        <p>Use the code below to verify your email:</p>
                        <p><strong>${otp}</strong></p>
                        <p>This code will expire in 5 minutes.</p>
                        `
                        );
                    } catch (mailErr) {
                        console.error('Login: resend verification OTP mail failed:', mailErr);
                        return res.status(503).json({
                            success: false,
                            message:
                                'Could not send verification email. Check SMTP configuration or try again later.',
                            isVerified: false,
                            userId: user.id,
                        });
                    }

                    return res.status(200).json({
                        success: false,
                        message: 'OTP sent successfully, verify your account first',
                        isVerified: false,
                        userId: user.id,
                    });
                }
            }

            // const hashedPassword = await bcrypt.hash("12321", 10);
            // console.log("1212:", hashedPassword);

            const isPasswordValid = await bcrypt.compare(password, user.password);
            console.log("isPasswordValid:", isPasswordValid);


            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid password',
                });
            }

            const payload = {
                name: `${user.firstName} ${user.lastName}`,
                email: user.email,
                id: user.id,
                role: user.role,
            };

            const token = jwt.sign(
                payload,
                process.env.JWT_SECRET!,
                { expiresIn: '1d' }
            );

            await prisma.accessToken.create({
                data: {
                    token,
                    userId: user.id,
                    expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
                },
            });

            // creating cookie
            const options = {
                expires: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
                httpOnly: true,
            };

            const newUser = {
                _id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isVerified: user.isVerified,
                isActive: user.isActive,
            };

            try {
                await recordAuthAudit(req, 'LOGIN', `User logged in: ${user.email}`, {
                    id: user.id,
                    role: user.role,
                });
            } catch (auditErr) {
                console.error('Login audit log failed:', auditErr);
            }

            return res.cookie('token', token, options).status(200).json({
                success: true,
                token,
                user: newUser,
                message: 'User logged in successfully',
            });
        } catch (error) {
            console.log(error, 'login error');
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async verifyOtp(req: Request, res: Response) {
        try {
            const { userId, otp } = req.body;

            if (!userId || !otp) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required',
                });
            }

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            const nowSec = Math.floor(Date.now() / 1000);
            const otpExpirySec = user.otpExpiry;
            if (user.otp !== Number(otp) || nowSec > otpExpirySec) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or Expired OTP',
                });
            }

            await prisma.user.update({
                where: { id: user.id },
                data: { isVerified: true, otp: 0, otpExpiry: 0 },
            });

            return res.status(200).json({
                success: true,
                message: 'User verified successfully',
            });
        } catch (error) {
            console.log(error, 'verify otp error');
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    /**
     * Sends a one-time OTP to the authenticated user's email to approve sensitive actions
     * like editing bank details.
     */
    async sendBankEditOtp(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id as string | undefined;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required',
                });
            }

            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, email: true, role: true },
            });

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            if (!user.email) {
                return res.status(400).json({
                    success: false,
                    message: 'User email is not available',
                });
            }

            // Keep only the latest OTP for this action
            await prisma.verificationToken.deleteMany({
                where: { userId: user.id, tokenType: 'BANK_EDIT' },
            });

            // 6-digit OTP
            const otp = crypto.randomInt(100000, 999999);
            const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            // Store hashed OTP (VerificationToken.token is a string)
            const token = crypto
                .createHash('sha256')
                .update(String(otp))
                .digest('hex');

            await prisma.verificationToken.create({
                data: {
                    token,
                    userId: user.id,
                    role: user.role,
                    tokenType: 'BANK_EDIT',
                    expiresAt: otpExpiry,
                },
            });

            try {
                await sendCredentialMail(
                    user.email,
                    'IN-HOUSE CRM - Verify bank details edit',
                    `
                    <h2>Verify your email</h2>
                    <p>Use the code below to verify your request to edit bank details:</p>
                    <p><strong>${otp}</strong></p>
                    <p>This code will expire in 5 minutes.</p>
                `
                );
            } catch (mailErr) {
                await prisma.verificationToken.deleteMany({
                    where: { userId: user.id, tokenType: 'BANK_EDIT', token },
                });
                console.error('sendBankEditOtp: mail failed:', mailErr);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to send OTP email',
                });
            }

            return res.status(200).json({
                success: true,
                message: 'OTP sent successfully',
            });
        } catch (error) {
            console.error('sendBankEditOtp error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async verifyBankEditOtp(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id as string | undefined;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required',
                });
            }

            const { otp } = req.body as { otp?: string };
            if (!otp) {
                return res.status(400).json({
                    success: false,
                    message: 'OTP is required',
                });
            }

            const tokenRecord = await prisma.verificationToken.findFirst({
                where: {
                    userId,
                    tokenType: 'BANK_EDIT',
                    expiresAt: { gt: new Date() },
                },
                orderBy: { createdAt: 'desc' },
            });

            if (!tokenRecord) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or Expired OTP',
                });
            }

            const hashedOtp = crypto
                .createHash('sha256')
                .update(String(otp))
                .digest('hex');

            if (tokenRecord.token !== hashedOtp) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or Expired OTP',
                });
            }

            // OTP is single-use. Clear all outstanding tokens for this action.
            await prisma.verificationToken.deleteMany({
                where: { userId, tokenType: 'BANK_EDIT' },
            });

            // Mark the verification as approved (short-lived approval)
            await prisma.verificationToken.deleteMany({
                where: { userId, tokenType: 'BANK_EDIT_VERIFIED' },
            });
            await prisma.verificationToken.create({
                data: {
                    token: crypto.randomBytes(16).toString('hex'),
                    userId,
                    role: tokenRecord.role ?? undefined,
                    tokenType: 'BANK_EDIT_VERIFIED',
                    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
                },
            });

            return res.status(200).json({
                success: true,
                message: 'OTP verified successfully',
            });
        } catch (error) {
            console.error('verifyBankEditOtp error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async forgotPassword(req: Request, res: Response) {
        try {
            const { email } = req.body;
            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is required',
                });
            }

            const normalizedEmail = String(email).trim().toLowerCase();
            const user = await prisma.user.findFirst({ where: { email: normalizedEmail } });
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            const otp = crypto.randomInt(100000, 999999); // Generates a 6-digit OTP
            const otpExpiry = Math.floor(Date.now() / 1000) + 5 * 60; // OTP expires in 5 minutes

            await prisma.user.update({
                where: { id: user.id },
                data: { otp, otpExpiry },
            });

            try {
                await sendCredentialMail(
                    user.email,
                    'IN-HOUSE CRM - Forgot Password OTP',
                    `
                <h2>Forgot Password OTP</h2>
                <p>Use the code below to reset your password:</p>
                <p><strong>${otp}</strong></p>
                <p>This code will expire in 5 minutes.</p>
                `
                );
            } catch (mailErr) {
                console.error('Forgot password: mail failed:', mailErr);
                return res.status(503).json({
                    success: false,
                    message:
                        'Could not send reset email. Check SMTP configuration (SENDGRID_API_KEY or SMTP_AUTH_USER / SMTP_AUTH_PASS).',
                });
            }

            return res.status(200).json({
                success: true,
                message: 'OTP sent successfully',
                userId: user.id,
            });
        } catch (error) {
            console.log(error, 'forgot password error');
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async resetPassword(req: Request, res: Response) {
        try {
            const { userId, password } = req.body;
            if (!userId || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required',
                });
            }

            const resetPasswordValidationError = validateStandardPassword(String(password));
            if (resetPasswordValidationError) {
                return res.status(400).json({
                    success: false,
                    message: resetPasswordValidationError,
                });
            }

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            await prisma.user.update({
                where: { id: user.id },
                data: { password: hashedPassword },
            });

            return res.status(200).json({
                success: true,
                message: 'Password reset successfully',
            });
        } catch (error) {
            console.log(error, 'reset password error');
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    /**
     * One-time setup: creates the first SUPER_ADMIN when the database has none.
     * Requires env BOOTSTRAP_SUPER_ADMIN_SECRET (min 24 chars). Send the same value in header X-Bootstrap-Secret.
     * After the first Super Admin exists, create more via POST /auth/create-user as that user.
     */
    async bootstrapSuperAdmin(req: Request, res: Response) {
        try {
            const configuredSecret = process.env.BOOTSTRAP_SUPER_ADMIN_SECRET?.trim() ?? '';
            if (!configuredSecret || configuredSecret.length < MIN_BOOTSTRAP_SECRET_LENGTH) {
                return res.status(403).json({
                    success: false,
                    message:
                        'Bootstrap is disabled. Set BOOTSTRAP_SUPER_ADMIN_SECRET in the server environment (at least 24 characters), restart, then call again.',
                });
            }

            const provided =
                (typeof req.headers['x-bootstrap-secret'] === 'string'
                    ? req.headers['x-bootstrap-secret']
                    : Array.isArray(req.headers['x-bootstrap-secret'])
                      ? req.headers['x-bootstrap-secret'][0]
                      : '') ?? '';

            if (!timingSafeEqualUtf8(provided.trim(), configuredSecret)) {
                return res.status(403).json({
                    success: false,
                    message: 'Invalid bootstrap secret',
                });
            }

            const existingSuperCount = await prisma.user.count({
                where: { role: 'SUPER_ADMIN' },
            });
            if (existingSuperCount > 0) {
                return res.status(409).json({
                    success: false,
                    message:
                        'A Super Admin account already exists. Log in as Super Admin and use POST /auth/create-user to invite others, or promote users in the database.',
                });
            }

            const { firstName, lastName, email, password, phone } = req.body ?? {};
            const fTrim = firstName != null ? String(firstName).trim() : '';
            const lTrim = lastName != null ? String(lastName).trim() : '';
            if (!fTrim || !lTrim) {
                return res.status(400).json({
                    success: false,
                    message: 'firstName and lastName are required',
                });
            }
            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'email and password are required',
                });
            }

            const emailStr = String(email).trim().toLowerCase();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailStr)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email format',
                });
            }
            const bootstrapPasswordValidationError = validateStandardPassword(String(password));
            if (bootstrapPasswordValidationError) {
                return res.status(400).json({
                    success: false,
                    message: bootstrapPasswordValidationError,
                });
            }

            const dup = await prisma.user.findFirst({ where: { email: emailStr } });
            if (dup) {
                return res.status(409).json({
                    success: false,
                    message:
                        'That email is already registered. Use a different email or update the existing user’s role to SUPER_ADMIN in the database.',
                });
            }

            const hashedPassword = await bcrypt.hash(String(password), 10);

            const user = await prisma.user.create({
                data: {
                    firstName: fTrim,
                    lastName: lTrim,
                    email: emailStr,
                    password: hashedPassword,
                    role: 'SUPER_ADMIN',
                    isActive: true,
                    isVerified: true,
                    otp: 0,
                    otpExpiry: 0,
                    ...(phone !== undefined &&
                        phone !== null &&
                        String(phone).trim() !== '' && { phone: String(phone).trim() }),
                },
            });

            return res.status(201).json({
                success: true,
                message:
                    'Super Admin created. Share the login URL, email, and password securely. Remove or rotate BOOTSTRAP_SUPER_ADMIN_SECRET when finished.',
                data: {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                },
            });
        } catch (error: any) {
            console.error('bootstrapSuperAdmin error:', error);
            const code = error?.code;
            if (code === 'P2002') {
                return res.status(409).json({
                    success: false,
                    message: 'A user with this email already exists',
                });
            }
            return res.status(500).json({
                success: false,
                message: process.env.NODE_ENV === 'development' ? error?.message : 'Internal server error',
            });
        }
    }

    async logout(req: Request, res: Response) {
        try {
            const token = req.headers.authorization?.split(' ')[1] || req.cookies.token;
            if (!token) {
                return res.status(400).json({
                    success: false,
                    message: 'No token found',
                });
            }

            const tokenRow = await prisma.accessToken.findFirst({
                where: { token },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            role: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                },
            });

            if (!tokenRow) {
                return res.status(401).json({
                    success: false,
                    message: 'Unauthorized',
                });
            }

            await prisma.accessToken.updateMany({
                where: { token },
                data: { expiresAt: new Date() },
            });

            if (tokenRow.user) {
                try {
                    await recordAuthAudit(req, 'LOGOUT', `User logged out: ${tokenRow.user.email}`, {
                        id: tokenRow.user.id,
                        role: tokenRow.user.role,
                    });
                } catch (auditErr) {
                    console.error('Logout audit log failed:', auditErr);
                }
            }

            res.clearCookie('token');
            return res.status(200).json({
                success: true,
                message: 'User logged out successfully',
            });
        } catch (error) {
            console.log(error, 'logout error');
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

}

const authController = new AuthController();
export default authController;