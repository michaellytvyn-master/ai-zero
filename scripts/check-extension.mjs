/**
 * Validates a built extension the way Chrome does when loading it unpacked:
 * the manifest must parse, and every file it names must exist. Chrome's own
 * message for this is "Manifest file is missing or unreadable", which does not
 * say which file or why.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../apps/extension/dist/', import.meta.url))
const problems = []

if (!existsSync(dist)) {
  console.error(`No build at ${dist}\nRun: pnpm --filter @zca/extension build`)
  process.exit(1)
}

const manifestPath = join(dist, 'manifest.json')
if (!existsSync(manifestPath)) {
  console.error(`No manifest.json in ${dist}\nRun: pnpm --filter @zca/extension build`)
  process.exit(1)
}

let manifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (error) {
  console.error(`manifest.json does not parse: ${error.message}`)
  process.exit(1)
}

const requireFile = (relative, why) => {
  if (relative === undefined) return
  const target = join(dist, relative)
  if (!existsSync(target) || !statSync(target).isFile()) {
    problems.push(`${why} points at ${relative}, which is not in the build`)
  }
}

if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3')
for (const field of ['name', 'version']) {
  if (typeof manifest[field] !== 'string') problems.push(`${field} is missing`)
}

requireFile(manifest.background?.service_worker, 'background.service_worker')
requireFile(manifest.side_panel?.default_path, 'side_panel.default_path')
requireFile(manifest.action?.default_popup, 'action.default_popup')
for (const [size, path] of Object.entries(manifest.icons ?? {})) requireFile(path, `icons.${size}`)
for (const [size, path] of Object.entries(manifest.action?.default_icon ?? {})) {
  requireFile(path, `action.default_icon.${size}`)
}

for (const origin of manifest.host_permissions ?? []) {
  if (!/^(https?:\/\/|<all_urls>)/.test(origin)) {
    problems.push(`host_permissions entry "${origin}" is not a URL pattern`)
  }
}

if (problems.length > 0) {
  console.error('The built extension would not load:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`${manifest.name} ${manifest.version} is loadable.`)
console.log(`Load unpacked from: ${dist.replace(/\/$/, '')}`)
console.log(`  permissions:      ${(manifest.permissions ?? []).join(', ')}`)
console.log(`  host permissions: ${(manifest.host_permissions ?? []).join(', ')}`)
