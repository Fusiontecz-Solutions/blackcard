import jwt from "jsonwebtoken";
import { tokenRepository } from "../repositories/tokenRepository";
import { ValidationError } from "../../utils/errors";
import type { UserWithRole } from "../../types/common";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET!;
const VERIFICATION_TOKEN_SECRET = process.env.VERIFICATION_TOKEN_SECRET!;
const RESET_TOKEN_SECRET = process.env.RESET_TOKEN_SECRET!;
function getDecisionLogicTokenSecret(): string {
  const secret =
    process.env.DECISION_LOGIC_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    process.env.ACCESS_TOKEN_SECRET;
  if (!secret) {
    throw new ValidationError(
      "Missing DECISION_LOGIC_TOKEN_SECRET (or JWT_SECRET/ACCESS_TOKEN_SECRET)."
    );
  }
  return secret;
}

export const tokenManager = {
  async generateAccessToken(user: UserWithRole): Promise<string> {
    return jwt.sign(
      { userId: user.id, role: user?.role?.name },
      ACCESS_TOKEN_SECRET,
      {
        expiresIn: "60m",
      }
    );
  },

  async generateRefreshToken(userId: string): Promise<string> {
    const refreshToken = jwt.sign({ userId }, REFRESH_TOKEN_SECRET, {
      expiresIn: "7d",
    });
    tokenRepository.saveRefreshToken(userId, refreshToken);
    return refreshToken;
  },

  async validateRefreshToken(token: string): Promise<string> {
    try {
      const { userId } = jwt.verify(token, REFRESH_TOKEN_SECRET) as {
        userId: string;
      };
      const storedToken = tokenRepository.findRefreshToken(token);
      if (!storedToken) throw new Error("Invalid refresh token");
      return userId;
    } catch (error) {
      throw new ValidationError("Refresh token validation failed");
    }
  },

  async invalidateRefreshToken(token: string): Promise<void> {
    tokenRepository.deleteRefreshToken(token);
  },

  async genrateVarificationToken(userId: string) {
    return jwt.sign({ userId }, VERIFICATION_TOKEN_SECRET, {
      expiresIn: "1h",
    });
  },

  async validateVerificationToken(token: string): Promise<string> {
    try {
      const { userId } = jwt.verify(token, VERIFICATION_TOKEN_SECRET) as {
        userId: string;
      };

      return userId;
    } catch (error) {
      throw error;
    }
  },

  async generateResetToken(userId: string) {
    return jwt.sign({ userId }, RESET_TOKEN_SECRET, {
      expiresIn: "1h",
    });
  },

  validateResetToken(token: string) {
    return jwt.verify(token, RESET_TOKEN_SECRET) as {
      userId: string;
    };
  },

  async generateDecisionLogicToken(
    businessOwnerId: number,
    bankAccountId: number
  ) {
    const decisionLogicSecret = getDecisionLogicTokenSecret();
    return jwt.sign(
      { businessOwnerId, bankAccountId },
      decisionLogicSecret,
      {
        expiresIn: "1d",
      }
    );
  },

  async validateDecisionLogicToken(token: string) {
    const decisionLogicSecret = getDecisionLogicTokenSecret();
    return jwt.verify(token, decisionLogicSecret) as {
      businessOwnerId: number;
      bankAccountId: number;
    };
  },

  async generatePaymentVerificationToken(
    invoiceId: string,
    applicationId: number,
    dueDate: string
  ) {
    const exp = Math.floor(new Date(dueDate).getTime() / 1000);
    if (!Number.isFinite(exp)) {
      throw new ValidationError("Invalid due date for payment verification token.");
    }
    const decisionLogicSecret = getDecisionLogicTokenSecret();
    return jwt.sign(
      { invoiceId, applicationId, exp },
      decisionLogicSecret
    );
  },

  async validatePaymentVerificationToken(token: string) {
    const decisionLogicSecret = getDecisionLogicTokenSecret();
    return jwt.verify(token, decisionLogicSecret) as {
      invoiceId: string;
      applicationId: number;
    };
  },
};
