import crypto from 'crypto';

const ENCRYPTION_PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('FIELD_ENCRYPTION_KEY is not set');
  }

  // Derive a stable 32-byte key from the provided secret.
  // This accepts arbitrary length secrets while producing an AES-256 key.
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}

function encryptPlaintext(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // recommended IV length for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return (
    ENCRYPTION_PREFIX +
    `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`
  );
}

export function encryptField(value: string): string {
  const plaintext = String(value ?? '').trim();
  if (!plaintext) return plaintext;
  if (isEncrypted(plaintext)) {
    try {
      const decrypted = decryptField(plaintext);
      if (decrypted == null || isEncrypted(decrypted)) {
        throw new Error('decrypt failed');
      }
      return encryptPlaintext(String(decrypted).trim());
    } catch {
      throw new Error(
        'Unable to decrypt stored bank value with the current FIELD_ENCRYPTION_KEY. Please re-enter the account and routing numbers.',
      );
    }
  }

  return encryptPlaintext(plaintext);
}

export function decryptField(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  if (!isEncrypted(value)) return value;

  const payload = value.slice(ENCRYPTION_PREFIX.length);
  const [ivB64, tagB64, ciphertextB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !ciphertextB64) {
    // If the stored value is malformed, return it as-is rather than crashing responses.
    return value;
  }

  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Never throws — returns null when decryption fails (wrong key, corrupt data, etc.). */
export function decryptSensitiveField(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  if (!isEncrypted(value)) return value;
  try {
    const decrypted = decryptField(value);
    if (decrypted == null || isEncrypted(decrypted)) {
      console.warn('[fieldEncryption] Failed to decrypt sensitive field (returning null)');
      return null;
    }
    return decrypted;
  } catch (err) {
    console.warn('[fieldEncryption] Failed to decrypt sensitive field:', err);
    return null;
  }
}

const CONTRACT_BANK_SCALAR_KEYS = [
  'authorizationClientBankAccount',
  'authorizationClientBankRouting',
] as const;

const ACH_BANK_SCALAR_KEYS = ['accountNumber', 'routingNumber'] as const;

const BANK_DETAIL_SCALAR_KEYS = ['accountNumber', 'routingNumber'] as const;

export function mapBankDetailRecordForApi<T extends Record<string, unknown>>(record: T): T {
  if (!record || typeof record !== 'object') return record;
  const out = { ...record } as T;
  for (const key of BANK_DETAIL_SCALAR_KEYS) {
    if (key in out) {
      (out as Record<string, unknown>)[key] = decryptSensitiveField(
        out[key] as string | null | undefined,
      );
    }
  }
  return out;
}

export function mapAchRecordForApi<T extends Record<string, unknown>>(record: T): T {
  if (!record || typeof record !== 'object') return record;
  const out = { ...record } as T;
  for (const key of ACH_BANK_SCALAR_KEYS) {
    if (key in out) {
      (out as Record<string, unknown>)[key] = decryptSensitiveField(
        out[key] as string | null | undefined,
      );
    }
  }
  return out;
}

export function mapContractRecordForApi<T extends Record<string, unknown>>(record: T): T {
  if (!record || typeof record !== 'object') return record;
  const out = { ...record } as T;
  for (const key of CONTRACT_BANK_SCALAR_KEYS) {
    if (key in out) {
      (out as Record<string, unknown>)[key] = decryptSensitiveField(
        out[key] as string | null | undefined,
      );
    }
  }
  if ('contractPrefillOverrides' in out && out.contractPrefillOverrides != null) {
    (out as Record<string, unknown>).contractPrefillOverrides = decryptEncryptedStringsInJson(
      out.contractPrefillOverrides,
    );
  }
  if (Array.isArray(out.achs)) {
    (out as Record<string, unknown>).achs = out.achs.map((row) =>
      mapAchRecordForApi(row as Record<string, unknown>),
    );
  }
  return out;
}

/** Recursively decrypt enc:v1: strings in JSON (e.g. contractPrefillOverrides). */
export function decryptEncryptedStringsInJson(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (!isEncrypted(value)) return value;
    return decryptSensitiveField(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => decryptEncryptedStringsInJson(item));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = decryptEncryptedStringsInJson(v);
    }
    return out;
  }
  return value;
}
