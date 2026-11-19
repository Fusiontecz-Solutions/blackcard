import { ROLES } from '../constants/roles';

export async function getRoles() {
  // In this setup, roles are static and defined in constants.
  // function to query Prisma instead.
  return ROLES;
}

