// Fails when raw Tailwind palette colors are used in the given folders.
// Migrated UI must use design tokens (bg-background, text-muted-foreground,
// bg-success, …) so light and dark mode stay consistent.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const RAW = new RegExp(
  `\\b(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow)-(?:${PALETTE})-\\d{2,3}(?:/\\d+)?\\b|\\b(?:bg|text)-(?:white|black)\\b`,
  'g'
)

function* files(dir) {
  // Folders that do not exist yet (e.g. not migrated so far) are skipped.
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) yield path
  }
}

const dirs = process.argv.slice(2)
let violations = 0
for (const dir of dirs) {
  for (const file of files(dir)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const match of line.matchAll(RAW)) {
          violations++
          console.log(`${file}:${i + 1}  ${match[0]}`)
        }
      })
  }
}
if (violations) {
  console.error(`\n${violations} raw color class(es) found. Use design tokens.`)
  process.exit(1)
}
console.log(`No raw color classes in: ${dirs.join(', ')}`)
