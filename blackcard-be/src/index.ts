import express, { Application, NextFunction, Request, Response } from 'express';
import './config/loadEnv';
import { runWithDefaultCcRemoved } from './config/mandatoryCc';
import 'reflect-metadata';
import { createServer } from 'http';
import { startCronJob } from './cron-job/crmGmailCronJob';
import { startSuperAdminPlatformCronJob } from './cron-job/superAdminPlatformCronJob';
import { startReportJobs } from './cron-job/reportJobs';
import { startSheetSyncCronJob } from './cron-job/sheetSyncCronJob';
import fileUpload from 'express-fileupload';
import connectDB from './config/database';
import router from './routes/index';
import cors from 'cors';
import cloudinaryConnect from './config/cloudinary';
import { initializeSocketIO } from './socket/index';
import { testRedisConnection } from './config/redis';
import { startCollectionPaymentUploadWorker } from './workers/collectionPaymentUploadWorker';
import { startApplicationApprovalWorker } from './workers/applicationApprovalWorker';
import { verifySuperAdminProxy } from './middleware/verifySuperAdminProxy';
import { activityLogger } from './middleware/activityLogger';
import { getDefaultMailFrom, getOutboundMailTransport } from './config/nodemailer';
import { primeUnderwriterRoutingCache } from './services/underwriterRoutingService';

process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException:', err?.stack || err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[process] unhandledRejection:', reason, promise);
});

// Create Express application
const app: Application = express();
const PORT = process.env.PORT || 4000;

// Create HTTP server for Socket.IO
const httpServer = createServer(app);

app.use(
  cors({
    // Allow the browser to read Content-Disposition on blob responses (Gmail attachment filename).
    exposedHeaders: ['Content-Disposition'],
  })
);
// Middleware
// Capture the raw request body so webhook signature verification (e.g. SendGrid
// "Signed Event Webhook" ECDSA check) can hash the exact bytes SendGrid signed.
// Without this, req.rawBody is undefined and signed webhooks are rejected.
app.use(
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// File upload middleware - handles multipart/form-data (req.files) for most routes.
// IMPORTANT: Do not run this on routes that use Multer — both parse multipart/body and the
// stream can only be consumed once (Multer then throws "Unexpected end of form").
import os from 'os';
const expressFileUploadMiddleware = fileUpload({
  useTempFiles: true,
  tempFileDir: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size (align with express.json; proxy must allow >= this)
  abortOnLimit: true,
});

app.use((req, res, next) => {
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return next();
  }
  const pathOnly = String(req.originalUrl || req.url || '').split('?')[0];
  if (
    pathOnly.includes('/applications/upload') ||
    pathOnly.includes('/applications/bulk-upload-excel') ||
    pathOnly.includes('/transactions/upload') ||
    pathOnly.includes('/pdf-extraction/')
  ) {
    return next();
  }
  return expressFileUploadMiddleware(req, res, next);
});

cloudinaryConnect();
console.log(
  `[mail] Outbound sender: ${getDefaultMailFrom()} (transport: ${getOutboundMailTransport()})`,
);
const sendgridWebhookBase = process.env.SENDGRID_WEBHOOK_URL?.trim().replace(/\/$/, '');
if (sendgridWebhookBase) {
  console.log(`[mail] SendGrid event webhook (configure in SendGrid dashboard): ${sendgridWebhookBase}/sendgrid/webhook`);
}
console.log('Starting CRM Email Bot...');
startCronJob();
startSuperAdminPlatformCronJob();
startSheetSyncCronJob();
// Test Redis connection, then start workers only when Redis is reachable.
void testRedisConnection()
  .catch(console.error)
  .finally(() => {
    startCollectionPaymentUploadWorker();
    startApplicationApprovalWorker();
  });

// Initialize Socket.IO
initializeSocketIO(httpServer);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Hybrid authentication gateway: every /api/v1 request first passes through
// the Super Admin proxy verifier. If it carries valid x-super-admin-proxy +
// x-super-admin-secret headers, `req.isSuperAdminProxy` is set and downstream
// `authenticateToken` will skip tenant JWT validation and synthesize a
// SUPER_ADMIN principal. Regular tenant-user requests are untouched.
// Default Cc chips the user removed in a mail popup (see config/mandatoryCc).
app.use((req, _res, next) => {
  const raw = String(req.headers['x-default-cc-removed'] || '').trim();
  if (!raw) return next();
  runWithDefaultCcRemoved(raw.split(','), next);
});
app.use('/api/v1', verifySuperAdminProxy, activityLogger, router);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: 'Not Found',
    path: req.path,
  });
});

// Error handling middleware — must be last (after all other `app.use` without 4 args)
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error('Error:', err);
  const status =
    err &&
    typeof err === 'object' &&
    'statusCode' in err &&
    typeof (err as { statusCode: unknown }).statusCode === 'number'
      ? (err as { statusCode: number }).statusCode
      : 500;
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  res.status(status).json({
    status: 'error',
    message,
  });
});

// Start the HTTP server after DB is ready (seed default templates)
void (async () => {
  await connectDB();
  await primeUnderwriterRoutingCache();
  httpServer.listen(PORT, () => {
    startReportJobs();
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Socket.IO server initialized`);
  });
})();

export default app;
