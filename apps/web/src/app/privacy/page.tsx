import Link from 'next/link'
import { orderedProviders } from '@zca/providers'
import { runtimeConfig } from '@/config'
import { IMAGE_LIFETIME_MS } from '@/lib/images'

export const metadata = { title: 'Privacy' }

export default function PrivacyPage() {
  const trial = runtimeConfig().DEMO_MESSAGES_PER_ACCOUNT_PER_DAY

  return (
    <main className="wrap">
      <h1>What we store</h1>
      <p className="muted">
        Written to be checkable rather than reassuring. Last updated 2026-09-09.
      </p>

      <h2>Where your messages actually go</h2>
      <p>
        This service does not run language models. Your message is forwarded to{' '}
        {orderedProviders()
          .map((p) => p.label)
          .join(' or ')}
        , on an API key <strong>you</strong> added, under the terms you accepted with them. What
        they do with it is governed by their policies, not ours. A free tier is not a
        confidentiality guarantee — do not send anything sensitive through one.
      </p>
      <p>
        The exception is the {trial}-message daily trial, which runs on the operator&apos;s own keys
        so you can evaluate the service before registering anywhere. See{' '}
        <Link href="/terms">the terms</Link>.
      </p>

      <h2>Your account</h2>
      <p>
        Your email address, and your name if you give one. If you sign in with a password we store a
        scrypt hash of it and never the password, so it cannot be read back out of the database.
        Signing in with Google stores no password at all.
      </p>

      <h2>Your conversations</h2>
      <p>
        Messages you send and the replies you receive are saved to your account, so you can return
        to them from another device or from the browser extension. You can delete any conversation,
        which removes it. Administrators of this service cannot read your conversations, and no
        operator page queries them.
      </p>

      <h2>Your provider keys</h2>
      <p>
        Keys you add are encrypted with AES-256-GCM before they are written to the database. The key
        that opens them is held outside the database, so a database dump on its own reveals nothing.
        Yours is decrypted only in memory, only while one of your own requests is being served, and
        never written to a log. Remove a key and the row is deleted.
      </p>

      <h2>Usage records</h2>
      <p>
        For every request: the provider name, the model, token counts, how long it took, the HTTP
        status, whose key paid, and a timestamp. That is the whole list, and it is what the operator
        dashboard shows. It never includes the content of a prompt or a reply.
      </p>

      <h2>Generated images</h2>
      <p>
        Images are held by an image host and <strong>deleted an hour after they are made</strong>,
        automatically. That is {Math.round(IMAGE_LIFETIME_MS / 60_000)} minutes, counted down under
        each picture. Download anything you want to keep.
      </p>

      <h2>Voice input</h2>
      <p>
        Audio is recorded only while you hold the button, sent to the transcription provider, and
        never written to disk or to the database here. Only the text comes back, and it goes into
        the message box for you to edit before anything is sent.
      </p>

      <h2>Pages you ask it to read</h2>
      <p>
        When you paste a link, or turn on page reading in the extension, that page&apos;s text is
        fetched and included in the request to the model. It is not stored separately; it becomes
        part of the conversation, which you can delete. Nothing is read unless you ask for it.
      </p>

      <h2>The browser extension</h2>
      <p>
        It signs in against this site. It ships with access to no website at all, and asks once
        before it can read pages. When it calls a provider directly using your key, it reports back
        only the metadata listed above — never the text of a request or a reply, and never the key.
      </p>

      <h2>Deleting everything</h2>
      <p>
        Deleting your account removes your conversations, your stored keys and your usage records.
        Anything already sent to a provider is subject to that provider&apos;s retention, which we
        do not control.
      </p>
    </main>
  )
}
