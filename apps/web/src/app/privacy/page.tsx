import type { Metadata } from 'next'
import Link from 'next/link'
import { orderedProviders } from '@zca/providers'
import { runtimeConfig } from '@/config'
import { TRIAL_HISTORY_MESSAGES } from '@/lib/content-store'
import { IMAGE_LIFETIME_MS } from '@/lib/images'

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What Zero-Cost AI stores, what it never stores, and how your provider keys are encrypted.',
  alternates: { canonical: '/privacy' },
}

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
      <p>Where they are kept is up to you.</p>
      <ul className="muted">
        <li>
          <strong>In your own database.</strong> Connect a Postgres of your own under Settings and
          every conversation is written there — to your database, not ours. We keep its address,
          encrypted like a key, and nothing of what is in it. Disconnect and everything stays where
          it is; only this service stops using it.
        </li>
        <li>
          <strong>Otherwise, your last {TRIAL_HISTORY_MESSAGES} messages here.</strong> Enough to
          try the service. Older ones are deleted as new ones arrive, and connecting your own
          database moves what is left into it and deletes it from ours.
        </li>
      </ul>
      <p>
        Either way this service sees your messages while it passes them to the model you chose —
        that is how an answer is produced — and keeps them nowhere else. You can delete any
        conversation. Administrators cannot read your conversations, and no operator page queries
        them.
      </p>

      <h2>Your provider keys</h2>
      <p>
        Keys you add are encrypted with AES-256-GCM before they are written to the database. The key
        that opens them is held outside the database, so a database dump on its own reveals nothing.
        Yours is decrypted only in memory, only while one of your own requests is being served, and
        never written to a log. Remove a key and the row is deleted. Your database address, if you
        connect one, is stored the same way.
      </p>

      <h2>Usage records</h2>
      <p>
        For every request: the provider name, the model, token counts, how long it took, the HTTP
        status, whose key paid, and a timestamp. That is the whole list, and it is what the operator
        dashboard shows. It never includes the content of a prompt or a reply.
      </p>

      <h2>What the provider does with it</h2>
      <p>
        This page can only speak for what happens here. Once a request leaves for the provider whose
        key you added, their terms apply, and they are not all the same.
      </p>
      <ul className="muted">
        <li>
          <strong>Groq and Cloudflare</strong> reserve no right to train on what you send.
        </li>
        <li>
          <strong>Google Gemini, on its free tier, does.</strong> Google&apos;s terms say it uses
          what you submit and what comes back to develop its products, that human reviewers may read
          it, and that you should not send sensitive, confidential or personal information. That
          warning is shown again on the page where you paste the key, because it is the moment the
          choice is made. Gemini is also last in the failover order, so it is reached only after the
          other two.
        </li>
      </ul>

      <h2>Generated images</h2>
      <p>
        Where a picture is kept depends on whose account it went to, and the caption under each one
        says which.
      </p>
      <ul className="muted">
        <li>
          <strong>Our shared test pool</strong>, if you have not connected an account of your own:
          the picture is{' '}
          <strong>deleted {Math.round(IMAGE_LIFETIME_MS / 60_000)} minutes after it is made</strong>
          , automatically, counted down under the picture. It is somewhere to try the feature, not
          somewhere to keep anything. Download what you want.
        </li>
        <li>
          <strong>Your own Cloudinary account</strong>, once you connect one in Settings: the
          picture is written there and <strong>we never delete it</strong>. It sits in your account,
          on your free tier, and only you can remove it. Disconnecting the account here leaves the
          pictures where they are.
        </li>
      </ul>

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
