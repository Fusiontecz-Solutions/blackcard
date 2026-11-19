-- Normalize legacy SendGrid delivery statuses on PaymentMailLog before enum shrink.
-- Maps delivery events to SENT; hard failures to FAILED.

UPDATE "PaymentMailLog"
SET status = 'SENT'::"PaymentMailLogStatus"
WHERE status IN (
  'DELIVERED',
  'OPENED',
  'CLICKED',
  'DEFERRED'
);

UPDATE "PaymentMailLog"
SET status = 'FAILED'::"PaymentMailLogStatus"
WHERE status IN (
  'BOUNCED',
  'DROPPED',
  'SPAM',
  'UNSUBSCRIBED'
);
