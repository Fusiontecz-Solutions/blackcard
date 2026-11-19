/**
 * Role values matching Prisma enum Role.
 * Used for GET /roles and validation.
 */
/** Must stay in sync with `enum Role` in `prisma/schema/application.prisma`. */
export const ROLES = [
  'AGENT',
  'SCRUBBING',
  'UNDERWRITER',
  'ACCOUNTANT',
  'ACCOUNTS',
  'ADMIN',
  'OPERATIONS',
  'SYNDICATOR',
  'SUPER_ADMIN',
] as const;

/** Roles allowed for public `POST /auth/register` (not SUPER_ADMIN or SYNDICATOR). */
export const PUBLIC_REGISTER_ROLES = ROLES.filter(
  (r) => r !== 'SUPER_ADMIN' && r !== 'SYNDICATOR',
);

export type RoleValue = (typeof ROLES)[number];

export function isValidRole(role: string): role is RoleValue {
  return ROLES.includes(role as RoleValue);
}
