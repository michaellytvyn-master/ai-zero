import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_ACCEPT,
  AttachmentError,
  MAX_ATTACHMENT_BYTES,
  asAttachmentMessage,
  isReadableName,
  readAttachment,
} from './attachments'

const file = (name: string, content: string) => new File([content], name, { type: 'text/plain' })

describe('isReadableName', () => {
  it('accepts text and source files', () => {
    for (const name of ['notes.txt', 'README.md', 'data.csv', 'a.ts', 'x.PY']) {
      expect(isReadableName(name), name).toBe(true)
    }
  })

  it('refuses formats a browser cannot turn into text on its own', () => {
    for (const name of ['scan.pdf', 'photo.png', 'archive.zip', 'sheet.xlsx', 'noextension']) {
      expect(isReadableName(name), name).toBe(false)
    }
  })
})

describe('readAttachment', () => {
  it('reads the contents and reports the name', async () => {
    const read = await readAttachment(file('notes.txt', 'hello there'), 100)

    expect(read.name).toBe('notes.txt')
    expect(read.text).toBe('hello there')
    expect(read.truncated).toBe(false)
  })

  it('truncates to the budget and says so', async () => {
    const read = await readAttachment(file('big.txt', 'x'.repeat(500)), 100)

    expect(read.text).toHaveLength(100)
    expect(read.truncated).toBe(true)
    expect(read.originalLength).toBe(500)
  })

  it('refuses a file too large to be worth reading into a prompt', async () => {
    const huge = file('huge.txt', 'x'.repeat(MAX_ATTACHMENT_BYTES + 1))
    await expect(readAttachment(huge, 1000)).rejects.toThrow(AttachmentError)
  })

  it('refuses a format it cannot read, rather than sending mojibake', async () => {
    await expect(readAttachment(file('scan.pdf', 'x'), 1000)).rejects.toThrow(AttachmentError)
  })

  it('refuses an empty file', async () => {
    await expect(readAttachment(file('empty.txt', '   '), 1000)).rejects.toThrow(AttachmentError)
  })
})

describe('asAttachmentMessage', () => {
  it('names each file and fences its contents', async () => {
    const message = asAttachmentMessage([
      await readAttachment(file('a.md', '# Title'), 100),
      await readAttachment(file('b.csv', 'x,y'), 100),
    ])

    expect(message).toContain('File: a.md')
    expect(message).toContain('File: b.csv')
    expect(message).toContain('# Title')
    expect(message.match(/"""/g)).toHaveLength(4)
  })

  it('admits truncation inside the message the model reads', async () => {
    const message = asAttachmentMessage([await readAttachment(file('a.txt', 'y'.repeat(50)), 10)])
    expect(message).toContain('Truncated: 10 of 50')
  })
})

describe('ATTACHMENT_ACCEPT', () => {
  it('is a file-input accept list, so the picker filters for the user', () => {
    expect(ATTACHMENT_ACCEPT.startsWith('.txt,')).toBe(true)
    expect(ATTACHMENT_ACCEPT).toContain('.md')
    expect(ATTACHMENT_ACCEPT).not.toContain('.pdf')
  })
})
