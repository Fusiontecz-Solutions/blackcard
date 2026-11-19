-- BoldSign / CRM: extend contract lifecycle for webhook-driven updates.
ALTER TYPE "ContractStatus" ADD VALUE 'VIEWED';
ALTER TYPE "ContractStatus" ADD VALUE 'SIGNED';
ALTER TYPE "ContractStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "ContractStatus" ADD VALUE 'DECLINED';
ALTER TYPE "ContractStatus" ADD VALUE 'REVOKED';
ALTER TYPE "ContractStatus" ADD VALUE 'EXPIRED';
