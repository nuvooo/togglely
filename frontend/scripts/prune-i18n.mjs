// Lists (or with --write removes) locale keys that no source file references.
//
// A key counts as used when
// - it appears as a complete string literal ('key', "key" or `key`) in a
//   non-test source file (covers t('key') and keys kept in config objects),
// - it starts with the static prefix of a template literal such as
//   `roles.${role}` (dynamic keys), or
// - it is a plural variant (key_one, key_other, …) of a used key.
// en and de are pruned with the same key list so both keep identical sets.
//
// Usage: node scripts/prune-i18n.mjs [--write]
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'src'
const LOCALES = ['src/i18n/locales/en.ts', 'src/i18n/locales/de.ts']
const KEY_LINE = /^ {2}(['"])(.+?)\1:/
const PLURAL = /_(zero|one|two|few|many|other)$/

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (path.replaceAll('\\', '/') !== 'src/i18n/locales') yield* sourceFiles(path)
    } else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) {
      yield path
    }
  }
}

const keysOf = (text) =>
  text
    .split('\n')
    .map((line) => line.match(KEY_LINE)?.[2])
    .filter(Boolean)

const source = [...sourceFiles(SRC)].map((f) => readFileSync(f, 'utf8')).join('\n')
const isLiteral = (text) =>
  ["'", '"', '`'].some((q) => source.includes(`${q}${text}${q}`))
const prefixes = new Set()
// Only dotted prefixes are key prefixes (`webhook-env-${id}` is a DOM id)
for (const m of source.matchAll(/`([a-z][\w-]*\.[\w.-]*)\$\{/g)) prefixes.add(m[1])

const allKeys = keysOf(readFileSync(LOCALES[0], 'utf8'))
const isUsed = (key) => {
  const base = key.replace(PLURAL, '')
  if (isLiteral(key) || isLiteral(base)) return true
  return [...prefixes].some((p) => key.startsWith(p))
}
const unused = new Set(allKeys.filter((k) => !isUsed(k)))

/** Removes the given keys (and section comments left without keys). */
function prune(text) {
  const lines = text.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const key = lines[i].match(KEY_LINE)?.[2]
    if (key && unused.has(key)) {
      // Value on the following line ("'key':\n    'value',")
      if (lines[i].trimEnd().endsWith(':')) i++
      continue
    }
    out.push(lines[i])
  }
  // Drop comments that no longer head any key, then collapse blank lines
  const cleaned = out.filter((line, i) => {
    if (!/^ {2}\/\//.test(line)) return true
    const next = out.slice(i + 1).find((l) => !/^ {2}\/\//.test(l))
    return next !== undefined && KEY_LINE.test(next)
  })
  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n\n}/, '\n}')
}

console.log(`${unused.size} of ${allKeys.length} keys unused`)
for (const key of unused) console.log(`  ${key}`)
if (process.argv.includes('--write')) {
  for (const file of LOCALES) writeFileSync(file, prune(readFileSync(file, 'utf8')))
  console.log(`Pruned ${LOCALES.join(', ')}`)
}
