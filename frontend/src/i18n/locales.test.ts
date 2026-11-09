import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { de } from './locales/de'
import { en } from './locales/en'

const SRC = join(__dirname, '..')
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return path === join(SRC, 'i18n', 'locales') ? [] : sourceFiles(path)
    }
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

/** Static keys of t('…') / i18n.t("…") calls with a plain string literal. */
function staticKeys(): { key: string; file: string }[] {
  const calls = /\bt\(\s*(['"])([^'"\n]+)\1/g
  return sourceFiles(SRC).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(calls)].map((m) => ({
      key: m[2],
      file: relative(SRC, file).replaceAll('\\', '/'),
    }))
  )
}

describe('locales', () => {
  it('de and en have the same keys', () => {
    const enKeys = Object.keys(en).sort()
    const deKeys = Object.keys(de).sort()
    expect(deKeys.filter((k) => !(k in en))).toEqual([])
    expect(enKeys.filter((k) => !(k in de))).toEqual([])
  })

  it('has no empty translations', () => {
    for (const [lang, dict] of Object.entries({ de, en })) {
      const empty = Object.entries(dict)
        .filter(([, value]) => !String(value).trim())
        .map(([key]) => `${lang}:${key}`)
      expect(empty).toEqual([])
    }
  })

  it('defines every key used with a static t() call', () => {
    const keys = staticKeys()
    // Guard against the scan silently finding nothing
    expect(keys.length).toBeGreaterThan(500)
    const exists = (key: string) =>
      key in en || PLURAL_SUFFIXES.some((suffix) => `${key}${suffix}` in en)
    const missing = keys
      .filter(({ key }) => !exists(key))
      .map(({ key, file }) => `${file}: ${key}`)
    expect(missing).toEqual([])
  })
})
