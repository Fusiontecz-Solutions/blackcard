export function validateStandardPassword(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least 1 uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include at least 1 lowercase letter.';
  }
  if (!/\d/.test(password)) {
    return 'Password must include at least 1 number.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include at least 1 special character.';
  }
  return null;
}

export function getPasswordRequirementStatus(password: string) {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
}
