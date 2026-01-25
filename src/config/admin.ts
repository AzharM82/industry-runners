/**
 * Admin Bypass Configuration
 *
 * Users in this list will bypass payment requirements.
 * Add email addresses of owner and testers.
 */

export const ADMIN_EMAILS: string[] = [
  // Owner
  'your-email@example.com',  // TODO: Replace with your email

  // Testers
  // 'tester1@example.com',
  // 'tester2@example.com',
];

/**
 * Check if a user email is in the admin bypass list
 */
export function isAdminUser(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Admin users get unlimited prompts
 */
export const ADMIN_MONTHLY_LIMIT = 999999;

/**
 * Regular user monthly limit per prompt type
 */
export const USER_MONTHLY_LIMIT = 30;

/**
 * Get the monthly limit for a user
 */
export function getMonthlyLimit(email: string | null | undefined): number {
  return isAdminUser(email) ? ADMIN_MONTHLY_LIMIT : USER_MONTHLY_LIMIT;
}
