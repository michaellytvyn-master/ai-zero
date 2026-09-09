export const MAX_ATTACHMENT_BYTES = 512 * 1024

/** Formats a browser reads as text without a parser. */
export const READABLE_EXTENSIONS = [
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'yaml',
  'yml',
  'toml',
  'xml',
  'html',
  'css',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'php',
  'sh',
  'sql',
  'log',
  'env',
  'ini',
  'conf',
] as const

export const ATTACHMENT_ACCEPT = READABLE_EXTENSIONS.map((ext) => `.${ext}`).join(',')

export class AttachmentError extends Error {}

export interface Attachment {
  readonly name: string
  readonly text: string
  readonly truncated: boolean
  readonly originalLength: number
}

export function isReadableName(name: string): boolean {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  return (READABLE_EXTENSIONS as readonly string[]).includes(extension)
}

/**
 * Read in the browser rather than uploaded. A text file is already text, so
 * sending it to a server only to send it back would add a round trip, a storage
 * question and a privacy question for nothing.
 */
export async function readAttachment(file: File, maxChars: number): Promise<Attachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentError(
      `${file.name} is larger than ${Math.round(MAX_ATTACHMENT_BYTES / 1024)} KB.`,
    )
  }
  if (!isReadableName(file.name)) {
    throw new AttachmentError(`${file.name} is not a text file this can read.`)
  }

  const text = (await file.text()).trim()
  if (text.length === 0) throw new AttachmentError(`${file.name} is empty.`)

  return {
    name: file.name,
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars,
    originalLength: text.length,
  }
}

export function asAttachmentMessage(attachments: readonly Attachment[]): string {
  const blocks = attachments.map((file) =>
    [
      `File: ${file.name}`,
      '',
      '"""',
      file.text,
      '"""',
      file.truncated
        ? `(Truncated: ${file.text.length} of ${file.originalLength} characters.)`
        : '',
    ]
      .join('\n')
      .trim(),
  )

  return [
    'The user attached the files below. Answer using their contents.',
    '',
    blocks.join('\n\n'),
  ].join('\n')
}
