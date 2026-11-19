const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Turn a plural-ish entity/collection label into a singular, lower-case noun. */
function singularize(label: string): string {
  const clean = label.replace(/-/g, ' ').trim().toLowerCase();
  if (!clean) return '';
  if (clean.endsWith('ies')) return `${clean.slice(0, -3)}y`;
  if (clean.endsWith('ses')) return clean.slice(0, -2);
  if (clean.endsWith('s')) return clean.slice(0, -1);
  return clean;
}

function nounPhrase(entity: string): string {
  const singular = singularize(entity);
  if (!singular || singular === 'system') return 'the system';
  const article = /^[aeiou]/.test(singular) ? 'an' : 'a';
  return `${article} ${singular}`;
}

function verbFor(action: string): string {
  switch (action.toUpperCase()) {
    case 'CREATE':
      return 'Created';
    case 'UPDATE':
    case 'PUT':
    case 'PATCH':
      return 'Updated';
    case 'DELETE':
      return 'Deleted';
    default:
      return action.charAt(0).toUpperCase() + action.slice(1).toLowerCase();
  }
}

/** Trailing, meaningful path segment (sub-resource action) if present. */
function subActionFromPath(path: string): string {
  const parts = path.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  if (parts.length > 2 && !UUID_RE.test(last) && !/^\d+$/.test(last)) {
    return last.replace(/-/g, ' ');
  }
  return '';
}

/**
 * Build a human-readable audit description that never exposes raw HTTP
 * methods or API endpoints.
 */
export function buildAuditDescription(action: string, entity: string, path: string): string {
  const noun = nounPhrase(entity);
  const subAction = subActionFromPath(path);
  const verb = verbFor(action);
  return subAction
    ? `${verb} the ${subAction} of ${noun.replace(/^a /, '')}`
    : `${verb} ${noun}`;
}

/**
 * Rewrite legacy descriptions like
 * "UPDATE Applications via PUT /api/v1/applications/<uuid>/queue"
 * into a clean phrase. Non-matching descriptions are returned unchanged.
 */
export function sanitizeAuditDescription(description: string | null | undefined): string {
  const raw = (description ?? '').trim();
  if (!raw) return raw;

  const match = raw.match(/^(\w+)\s+([\w-]+)\s+via\s+(?:GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i);
  if (!match) return raw;

  const [, action, entity, path] = match;
  return buildAuditDescription(action, entity, path);
}
