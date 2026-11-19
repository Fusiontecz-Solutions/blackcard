-- Keep the newest row when duplicate question/application pairs exist.
DELETE FROM "ComplianceCheck" a
USING "ComplianceCheck" b
WHERE a."applicationId" = b."applicationId"
  AND a.question = b.question
  AND a."updatedAt" < b."updatedAt";

CREATE UNIQUE INDEX "ComplianceCheck_applicationId_question_key"
ON "ComplianceCheck"("applicationId", "question");
