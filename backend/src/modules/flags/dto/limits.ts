/** Shared input size limits for feature flag DTOs. */
export const FLAG_NAME_MAX_LENGTH = 200
export const FLAG_KEY_MAX_LENGTH = 100
export const FLAG_DESCRIPTION_MAX_LENGTH = 2000
/** Max length of a stored flag value (STRING/NUMBER/JSON as string). */
export const FLAG_VALUE_MAX_LENGTH = 64 * 1024
/** Max number of environments that can be pre-seeded on flag creation. */
export const FLAG_INITIAL_VALUES_MAX_ENTRIES = 100
