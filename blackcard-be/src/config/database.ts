import prisma from './prismaClient';

// Optional explicit connection helper. Prisma will lazily connect on first query,
// but keeping this function preserves the existing `connectDB()` usage in `index.ts`.
const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('✅ Prisma connected to Neon successfully');
  } catch (error: any) {
    console.error('❌ Prisma connection error:', error?.message || error);
    process.exit(1);
  }
};

export default connectDB;
