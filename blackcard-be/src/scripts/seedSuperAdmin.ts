/**
 * Upserts the Black Card SUPER_ADMIN login.
 * Run: npx ts-node src/scripts/seedSuperAdmin.ts
 */
import '../config/loadEnv';
import bcrypt from 'bcryptjs';
import prisma from '../config/prismaClient';

const EMAIL = 'dev@blackcardfunding.com';
const PASSWORD = 'Admin@123';
const FIRST_NAME = 'Dev';
const LAST_NAME = 'Admin';

async function main() {
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const existing = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: 'insensitive' } },
  });

  if (existing) {
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        firstName: FIRST_NAME,
        lastName: LAST_NAME,
        email: EMAIL,
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        isActive: true,
        isVerified: true,
      },
    });
    console.log(`Updated SUPER_ADMIN: ${user.email} (${user.id})`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      firstName: FIRST_NAME,
      lastName: LAST_NAME,
      email: EMAIL,
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      isActive: true,
      isVerified: true,
      otp: 0,
      otpExpiry: 0,
    },
  });
  console.log(`Created SUPER_ADMIN: ${user.email} (${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
