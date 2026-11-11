import 'vitest'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

// @testing-library/jest-dom still augments vitest's pre-5 `Assertion<T>`.
// Vitest 5 changed it to `Assertion<R, T>`, so that augmentation no longer
// merges; custom matchers are declared on `Matchers<R, T>` instead.
declare module 'vitest' {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<any, R> {}
}
