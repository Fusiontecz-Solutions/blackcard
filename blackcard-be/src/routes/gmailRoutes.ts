// // GET /google/connect
// import { Request, Response } from 'express';
// import oAuth2Client from '../config/gmail';
// import dotenv from "dotenv";
// dotenv.config();
// // import prisma from '../config/prismaClient';

// // GET /google/connect
// export const connectGoogle = (req: Request, res: Response) => {
//     const authUrl = oAuth2Client.generateAuthUrl({
//       access_type: 'offline',   // 🔥 REQUIRED for refresh token
//       prompt: 'consent',        // 🔥 REQUIRED to force refresh token
//       include_granted_scopes: false,
//       scope: ['https://www.googleapis.com/auth/gmail.modify'],
//     });
  
//     res.redirect(authUrl);
//   };

// // GET /google/callback

// export const googleCallback = async (req: Request, res: Response) => {
//     const { code } = req.query;
  
//     const { tokens } = await oAuth2Client.getToken(code as string);
  
//     console.log("ACCESS TOKEN:", tokens.access_token);
//     console.log("REFRESH TOKEN:", tokens.refresh_token);
  
//     res.send("Google Connected. Check console.");
//   };

import type { Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { createOAuth2Client, invalidateAccessTokenCache } from '../config/gmail';
import prisma from '../config/prismaClient';

// ==============================
// 🔵 GET /google/connect
// ==============================

export const connectGoogle = async (req: Request, res: Response) => {
  try {
    // State is only used for basic presence/CSRF protection (we don't map user from it).
    const state = crypto.randomBytes(16).toString('hex');

    const oAuth2Client = createOAuth2Client();
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',   // 🔥 needed for refresh token
      prompt: 'consent',        // 🔥 force refresh token
      include_granted_scopes: false,
      // Need "userinfo" scopes (and/or openid) to read the selected Google account email.
      // scope: [
      //   'openid',
      //   'https://www.googleapis.com/auth/userinfo.email',
      //   'https://www.googleapis.com/auth/userinfo.profile',
      //   'https://www.googleapis.com/auth/gmail.modify',
      // ],
      scope: [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.send'
      ],
      state,
    });

    return res.redirect(authUrl);
  } catch (error: any) {
    console.error('Google connect error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to initialize Google OAuth',
    });
  }
};

// ==============================
// 🔵 GET /google/callback
// ==============================
export const googleCallback = async (req: Request, res: Response) => {
  try {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Missing OAuth code',
      });
    }

    if (!state) {
      return res.status(400).json({
        success: false,
        message: 'Missing OAuth state',
      });
    }

    // ✅ Exchange code for tokens (isolated client — not shared with token minting)
    const oAuth2Client = createOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);

    if (!tokens.access_token) {
      return res.status(400).json({
        success: false,
        message: 'No access token',
      });
    }

    // Try to get email from id_token first (if present), otherwise call Gmail profile (works with gmail.modify),
    // and only then fall back to Google userinfo.
    const getEmailFromIdToken = (idToken?: string): string => {
      if (!idToken) return '';
      const parts = idToken.split('.');
      if (parts.length < 2) return '';
      try {
        const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
        const payload = JSON.parse(payloadJson) as { email?: string };
        return String(payload.email || '').trim().toLowerCase();
      } catch {
        return '';
      }
    };

    const accessToken = tokens.access_token;
    let googleEmail =
      getEmailFromIdToken(tokens.id_token ?? undefined) ||
      '';

    if (!googleEmail) {
      // Gmail profile endpoint returns "emailAddress" and relies on Gmail scopes, not OpenID userinfo.
      try {
        const profileResp = await axios.get(
          'https://gmail.googleapis.com/gmail/v1/users/me/profile',
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        googleEmail = String(profileResp.data?.emailAddress || '').trim().toLowerCase();
      } catch (err: any) {
        console.error(
          'gmail profile request failed:',
          err?.response?.data || err?.message,
        );
        googleEmail = '';
      }
    }

    if (!googleEmail) {
      // Fallback (requires userinfo scopes / openid depending on token).
      try {
        const userInfoResp = await axios.get(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        googleEmail = String(userInfoResp.data?.email || '').trim().toLowerCase();
      } catch (err: any) {
        console.error('userinfo request failed:', err?.response?.data || err?.message);
        googleEmail = '';
      }
    }

    if (!googleEmail) {
      return res.status(400).json({
        success: false,
        message:
          'Failed to fetch Google email. If this started after a scope change, try Google sign-in again so it can re-consent with the updated scopes.',
      });
    }

    // ✅ Match email in DB only
    const user: any = await (prisma as any).user.findFirst({
      where: {
        email: {
          equals: googleEmail,
          mode: 'insensitive',
        },
      },
    });

    if (!user) {
      return res.status(403).json({
        success: false,
        message: `This email (${googleEmail}) is not registered in the system`,
      });
    }

    // ✅ Save refresh token to that user
    const refreshTokenToSave = tokens.refresh_token || user.googleRefreshToken || null;

    await (prisma as any).user.update({
      where: { id: user.id },
      data: {
        googleRefreshToken: refreshTokenToSave,
      },
    });

    invalidateAccessTokenCache(user.id);
    console.log(`[gmail] connected user=${user.email}`);

    return res.send(
      `✅ Google connected successfully for ${user.email}. Refresh token saved.`
    );
  } catch (error: any) {
    console.error(`[gmail] callback failed: ${error?.message || error}`);
    return res.status(500).json({
      success: false,
      message: error?.message || 'OAuth failed',
    });
  }
};