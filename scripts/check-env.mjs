/**
 * Fails when the web app's config schema and .env.example drift apart. Missing
 * a variable in the example is the kind of thing nobody notices until someone
 * new tries to run the project and gets an opaque validation error.
 */
import { readFileSync } from 'node:fs'

const here = (path) => new URL(path, import.meta.url)

const schema = readFileSync(here('../apps/web/src/config.ts'), 'utf8')
const example = readFileSync(here('../.env.example'), 'utf8')

const required = [...schema.matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1])

// Read straight from process.env rather than through the config schema, since
// the features they enable are optional and must not break startup when absent.
const alsoDocumented = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CRON_SECRET',
]
required.push(...alsoDocumented)
const documented = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]))

const missing = required.filter((name) => !documented.has(name))

if (missing.length > 0) {
  console.error('.env.example is missing variables the app requires:')
  for (const name of missing) console.error(`  ${name}`)
  process.exit(1)
}

console.log(`.env.example covers all ${required.length} configured variables`)
