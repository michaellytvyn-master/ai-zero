/**
 * Cloudinary serves an asset as a download when `fl_attachment` is in the
 * transformation segment, which saves shipping the bytes through this server
 * just to set a Content-Disposition header.
 */
export function asDownloadUrl(url: string, filename = 'image'): string {
  const marker = '/upload/'
  const at = url.indexOf(marker)
  if (at === -1) return url
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 60)
  return `${url.slice(0, at + marker.length)}fl_attachment:${safe}/${url.slice(at + marker.length)}`
}
