import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';
import { isValidRole, ROLES } from '../constants/roles';
import type { Role } from '@prisma/client';

const SALT_ROUNDS = 10;

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  isActive?: boolean;
  phone?: string;
}

export interface CreateUserResult {
  id: string;
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Validates and creates a user. Hashes password with bcrypt.
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const { firstName, lastName, email, password, role, isActive = true, phone } = input;

  const fName = String(firstName ?? '').trim();
  const lName = String(lastName ?? '').trim();
  const emailStr = String(email ?? '').trim().toLowerCase();
  const roleStr = String(role ?? '').toUpperCase().replace(/-/g, '_');

  if (!fName || !lName) {
    throw new Error('First name and last name are required');
  }
  if (!emailStr) {
    throw new Error('Email is required');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailStr)) {
    throw new Error('Invalid email format');
  }
  if (!password || String(password).length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
  if (!isValidRole(roleStr)) {
    throw new Error(`Invalid role. Must be one of: ${ROLES.join(', ')}`);
  }

  const existing = await prisma.user.findFirst({ where: { email: emailStr } });
  if (existing) {
    throw new Error('A user with this email already exists');
  }

  const hashedPassword = await bcrypt.hash(String(password), SALT_ROUNDS);



  const user = await prisma.user.create({
    data: {
      firstName: fName,
      lastName: lName,
      email: emailStr,
      password: hashedPassword,
      role: roleStr as Role,
      isActive: Boolean(isActive),
      ...(phone !== undefined && phone !== null && String(phone).trim() !== '' && { phone: String(phone).trim() }),
    },
  });

  return {
    id: user.id,
    userId: user.userId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

export const impersonateUserService = async (
  adminId: string,
  userId: string
) => {

  const admin = await prisma.user.findUnique({
    where: { id: adminId }
  });

  if (!admin || (admin.role !== "ADMIN" && admin.role !== "SUPER_ADMIN")) {
    throw new Error("Only admin can impersonate users");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
    throw new Error("Cannot impersonate another admin");
  }

  const payload = {
    name: `${user.firstName} ${user.lastName}`,
    email: user.email,
    id: user.id,
    role: user.role,
    impersonatedBy: adminId
  };

  const token = jwt.sign(
    payload,
    process.env.JWT_SECRET as string,
    { expiresIn: "1d" }
  );

  // ✅ VERY IMPORTANT (same as login)
  await prisma.accessToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    token,
    user: {
      _id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isVerified: user.isVerified,
      phone: user.phone
    }
  };
};

// export const impersonateUserService = async (
//   adminId: string,
//   userId: string
// ) => {

//   // check admin
//   const admin = await prisma.user.findUnique({
//     where: { id: adminId }
//   });

//   if (!admin || admin.role !== "ADMIN") {
//     throw new Error("Only admin can impersonate users");
//   }

//   // find target user
//   const user = await prisma.user.findUnique({
//     where: { id: userId }
//   });

//   if (!user) {
//     throw new Error("User not found");
//   }

//   if (user.role === "ADMIN") {
//     throw new Error("Cannot impersonate another admin");
//   }

//   // create impersonation token
//   const token = jwt.sign(
//     {
//       id: user.id,
//       role: user.role,
//       impersonatedBy: adminId
//     },
//     process.env.JWT_SECRET as string,
//     { expiresIn: "1d" }
//   );
//   console.log("token", token);

//   return {
//     token,
//     user: {
//       _id: user.id,
//       firstName: user.firstName,
//       lastName: user.lastName,
//       email: user.email,
//       role: user.role,
//       isActive: user.isActive,
//       isVerified: user.isVerified,
//       phone: user.phone
//     }
//   };
// };
// export const impersonateUserService = async (
//   adminId: string,
//   userId: string
// ) => {

//   // check admin
//   const admin = await prisma.user.findUnique({
//     where: { id: adminId }
//   });

//   if (!admin || admin.role !== "ADMIN") {
//     throw new Error("Only admin can impersonate users");
//   }

//   // find target user
//   const user = await prisma.user.findUnique({
//     where: { id: userId }
//   });

//   if (!user) {
//     throw new Error("User not found");
//   }

//   if (user.role === "ADMIN") {
//     throw new Error("Cannot impersonate another admin");
//   }

//   const token = jwt.sign(
//     {
//       id: user.id,
//       role: user.role,
//       impersonatedBy: adminId
//     },
//     process.env.JWT_SECRET as string,
//     { expiresIn: "1d" }
//   );

//   return {
//     token,
//     user: {
//       id: user.id,
//       name: `${user.firstName} ${user.lastName}`,
//       role: user.role
//     }
//   };
// };