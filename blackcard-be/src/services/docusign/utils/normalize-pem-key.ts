/**
 * Normalize RSA private key PEM pasted from DocuSign, .env, or a file.
 * Accepts literal \\n, single-line PEM, quoted strings, and extra whitespace.
 */
export function normalizePemKey(raw: string): string {
  let key = String(raw ?? '').trim();
  if (!key) return '';

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }

  key = key.replace(/\\n/g, '\n');
  key = key.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const beginMatch = key.match(/-----BEGIN ([A-Z ]+)-----/);
  const endMatch = key.match(/-----END ([A-Z ]+)-----/);

  if (beginMatch && endMatch) {
    const beginMarker = `-----BEGIN ${beginMatch[1]}-----`;
    const endMarker = `-----END ${endMatch[1]}-----`;
    const start = key.indexOf(beginMarker);
    const end = key.indexOf(endMarker);

    if (start >= 0 && end > start) {
      let body = key.slice(start + beginMarker.length, end);
      body = body.replace(/\s+/g, '');
      const lines = body.match(/.{1,64}/g) || [];
      key = `${beginMarker}\n${lines.join('\n')}\n${endMarker}`;
    }
  } else {
    key = key
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');
  }

  return key.trim();
}

export function isLikelyRsaPrivateKeyPem(raw: string): boolean {
  const key = normalizePemKey(raw);
  return (
    /-----BEGIN (RSA )?PRIVATE KEY-----/.test(key) &&
    /-----END (RSA )?PRIVATE KEY-----/.test(key)
  );
}
