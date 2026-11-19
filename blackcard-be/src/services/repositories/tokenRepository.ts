import prisma from "../../config/prismaClient";

const PASSWORD_RESET_TOKEN_TYPE = "PASSWORD_RESET";

type DecisionLogicTokenDelegate = {
  create(args: {
    data: {
      token: string;
      businessOwnerId: number;
      bankAccountId: number;
      expiresAt: Date;
    };
  }): Promise<{
    token: string;
    businessOwnerId: number;
    bankAccountId: number;
    requestCode: string | null;
    expiresAt: Date;
    createdAt: Date;
  }>;
  findUnique(args: {
    where: { token: string };
  }): Promise<{
    token: string;
    businessOwnerId: number;
    bankAccountId: number;
    requestCode: string | null;
    expiresAt: Date;
    createdAt: Date;
  } | null>;
  update(args: {
    where: { token: string };
    data: { requestCode: string };
  }): Promise<{
    token: string;
    businessOwnerId: number;
    bankAccountId: number;
    requestCode: string | null;
    expiresAt: Date;
    createdAt: Date;
  }>;
};

function decisionLogicTokens(): DecisionLogicTokenDelegate {
  return (prisma as unknown as { decisionLogicToken: DecisionLogicTokenDelegate })
    .decisionLogicToken;
}

export const tokenRepository = {
  refreshTokens: new Map<string, string>(),

  async findVerificationToken(userId: string, token: string) {
    return prisma.verificationToken.findFirst({
      where: {
        userId,
        token,
      },
    });
  },

  async saveVerificationToken(userId: string, verificationToken: string) {
    return prisma.verificationToken.create({
      data: {
        userId,
        token: verificationToken,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });
  },

  async removeVerificationToken(userId: string, token: string) {
    return prisma.verificationToken.deleteMany({
      where: {
        userId,
        token,
      },
    });
  },

  async findResetToken(userId: string, token: string) {
    return prisma.verificationToken.findFirst({
      where: {
        userId,
        token,
        tokenType: PASSWORD_RESET_TOKEN_TYPE,
      },
    });
  },

  async saveResetToken(userId: string, token: string) {
    return prisma.verificationToken.create({
      data: {
        userId,
        token,
        tokenType: PASSWORD_RESET_TOKEN_TYPE,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });
  },

  async removeRestToken(userId: string, token: string) {
    return prisma.verificationToken.deleteMany({
      where: {
        userId,
        token,
        tokenType: PASSWORD_RESET_TOKEN_TYPE,
      },
    });
  },

  async saveDecisionLogicToken(
    businessOwnerId: number,
    bankAccountId: number,
    token: string
  ) {
    return decisionLogicTokens().create({
      data: {
        businessOwnerId,
        bankAccountId,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  },

  async findDecisionLogicToken(token: string) {
    return decisionLogicTokens().findUnique({
      where: { token },
    });
  },

  async saveDecisionLogicTokenRequestCode(token: string, requestCode: string) {
    const rc = String(requestCode ?? "").trim();
    if (!rc) return null;
    return decisionLogicTokens().update({
      where: { token },
      data: { requestCode: rc },
    });
  },

  saveRefreshToken(userId: string, token: string): void {
    this.refreshTokens.set(token, userId);
  },

  findRefreshToken(token: string): string | null {
    return this.refreshTokens.get(token) || null;
  },

  deleteRefreshToken(token: string): void {
    this.refreshTokens.delete(token);
  },
};
