import prisma from "../config/prismaClient";

async function main() {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      email: true,
      role: true,
      isActive: true,
      isVerified: true,
      otp: true,
      createdAt: true,
    },
  });

  if (users.length === 0) {
    console.log('No ADMIN or SUPER_ADMIN users found in the database.');
    return;
  }

  console.log(`Found ${users.length} admin user(s):\n`);
  for (const u of users) {
    console.log(
      `- ${u.email.padEnd(45)}  role=${u.role.padEnd(11)} active=${u.isActive}  verified=${u.isVerified}  otp=${u.otp}  createdAt=${u.createdAt.toISOString()}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
