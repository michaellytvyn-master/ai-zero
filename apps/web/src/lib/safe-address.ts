import { isIP } from 'node:net'

/**
 * Whether an address may be fetched on a user's behalf.
 *
 * The server will follow links people paste, which is a request forgery
 * primitive: without this it would happily read the cloud metadata endpoint,
 * a database on localhost, or anything else inside the network perimeter.
 * Everything private is refused; only public addresses are allowed.
 */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return isPublicIPv4(address)
  if (version === 6) return isPublicIPv6(address)
  return false
}

function isPublicIPv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false
  const [a = 0, b = 0] = parts

  if (a === 0) return false // "this network"
  if (a === 10) return false // private
  if (a === 127) return false // loopback
  if (a === 100 && b >= 64 && b <= 127) return false // carrier-grade NAT
  if (a === 169 && b === 254) return false // link-local, and AWS/GCP metadata
  if (a === 172 && b >= 16 && b <= 31) return false // private
  if (a === 192 && b === 168) return false // private
  if (a === 192 && b === 0) return false // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false // benchmarking
  if (a >= 224) return false // multicast, reserved, broadcast
  return true
}

function isPublicIPv6(address: string): boolean {
  const lower = address.toLowerCase().replace(/^\[|\]$/g, '')
  if (lower === '::' || lower === '::1') return false // unspecified, loopback

  // ::ffff:a.b.c.d carries a v4 address, and must be judged as one.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
  if (mapped?.[1] !== undefined) return isPublicIPv4(mapped[1])

  if (/^f[cd]/.test(lower)) return false // unique local
  if (/^fe[89ab]/.test(lower)) return false // link-local
  if (/^ff/.test(lower)) return false // multicast
  return true
}

export class UnsafeUrlError extends Error {}

/** Parses and rejects anything that is not a plain public web address. */
export function parseFetchableUrl(candidate: string): URL {
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new UnsafeUrlError('That is not a URL.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https addresses can be read.')
  }
  if (url.username !== '' || url.password !== '') {
    throw new UnsafeUrlError('Addresses with credentials in them are refused.')
  }
  // A bare IP literal skips DNS, so it is judged here and now.
  if (isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0 && !isPublicAddress(url.hostname)) {
    throw new UnsafeUrlError('That address is not on the public internet.')
  }
  if (/^(localhost|.*\.localhost|.*\.internal|.*\.local)$/i.test(url.hostname)) {
    throw new UnsafeUrlError('That address is not on the public internet.')
  }
  return url
}
