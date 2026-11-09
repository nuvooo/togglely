export type PasswordIssue =
  | 'too-short'
  | 'too-long'
  | 'lowercase'
  | 'uppercase'
  | 'digit'

/**
 * Client-side mirror of the backend password policy (`IsPasswordPolicy`):
 * 8-128 characters with a lowercase letter, an uppercase letter and a digit.
 * Returns the first violated rule; the i18n key is `password.<issue>`.
 */
export function passwordIssue(password: string): PasswordIssue | null {
  if (password.length < 8) return 'too-short'
  if (password.length > 128) return 'too-long'
  if (!/[a-z]/.test(password)) return 'lowercase'
  if (!/[A-Z]/.test(password)) return 'uppercase'
  if (!/\d/.test(password)) return 'digit'
  return null
}
