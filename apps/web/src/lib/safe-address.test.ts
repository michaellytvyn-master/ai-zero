import { describe, expect, it } from 'vitest'
import { UnsafeUrlError, isPublicAddress, parseFetchableUrl } from './safe-address'

describe('isPublicAddress', () => {
  it('accepts ordinary public addresses', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) {
      expect(isPublicAddress(address), address).toBe(true)
    }
  })

  /**
   * The whole point of the check. 169.254.169.254 in particular is the cloud
   * metadata endpoint, where credentials live.
   */
  it('refuses everything inside a network perimeter', () => {
    for (const address of [
      '127.0.0.1',
      '0.0.0.0',
      '10.0.0.5',
      '172.16.9.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '::',
      'fd00::1',
      'fe80::1',
      'ff02::1',
    ]) {
      expect(isPublicAddress(address), address).toBe(false)
    }
  })

  it('sees through an IPv4 address wearing an IPv6 costume', () => {
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false)
    expect(isPublicAddress('::ffff:169.254.169.254')).toBe(false)
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true)
  })

  it('refuses anything that is not an address at all', () => {
    for (const value of ['', 'example.com', 'not an ip', '999.1.1.1']) {
      expect(isPublicAddress(value), value).toBe(false)
    }
  })
})

describe('parseFetchableUrl', () => {
  it('accepts an ordinary page', () => {
    expect(parseFetchableUrl('https://example.com/article').hostname).toBe('example.com')
  })

  it('refuses schemes that are not the web', () => {
    for (const url of [
      'file:///etc/passwd',
      'ftp://example.com',
      'gopher://example.com',
      'data:text/html,hi',
      'javascript:alert(1)',
    ]) {
      expect(() => parseFetchableUrl(url), url).toThrow(UnsafeUrlError)
    }
  })

  it('refuses an address inside the perimeter, written as a literal', () => {
    for (const url of [
      'http://127.0.0.1:5432/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1/admin',
      'http://[::1]:3000/',
      'http://localhost:3000/api',
      'http://db.internal/',
    ]) {
      expect(() => parseFetchableUrl(url), url).toThrow(UnsafeUrlError)
    }
  })

  it('refuses credentials smuggled into the authority', () => {
    expect(() => parseFetchableUrl('https://user:pass@example.com/')).toThrow(UnsafeUrlError)
  })

  it('refuses something that is not a URL at all', () => {
    expect(() => parseFetchableUrl('hello world')).toThrow(UnsafeUrlError)
  })
})
