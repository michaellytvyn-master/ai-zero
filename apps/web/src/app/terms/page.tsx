import Link from 'next/link'
import { orderedProviders } from '@zca/providers'
import { runtimeConfig } from '@/config'

export const metadata = { title: 'Terms' }

export default function TermsPage() {
  const trial = runtimeConfig().DEMO_MESSAGES_PER_ACCOUNT_PER_DAY

  return (
    <main className="wrap">
      <h1>Terms</h1>
      <p className="muted">
        Plain language, because terms nobody reads protect nobody. Last updated 2026-09-09.
      </p>

      <h2>What this service is</h2>
      <p>
        This is software: a router, a chat interface, a browser extension and an API over language
        model accounts that <strong>you</strong> hold. It does not provide access to language
        models, and it does not resell access to them. Nothing you pay for here, now or later, buys
        model capacity.
      </p>

      <h2>Your provider accounts are yours</h2>
      <p>
        You register with{' '}
        {orderedProviders()
          .map((p) => p.label)
          .join(' and ')}{' '}
        yourself. The API keys, the quota, the rate limits and the terms you accepted with them are
        yours, and your relationship with those companies is directly with them. This service acts
        only on your instruction, using the keys you chose to add.
      </p>
      <p>
        You are responsible for keeping within your providers&apos; terms. If a provider suspends or
        limits your account, that is between you and them; we cannot restore it and we do not
        substitute our own capacity for yours.
      </p>

      <h2>The trial</h2>
      <p>
        New accounts get {trial} messages a day on keys belonging to the operator of this service,
        so you can see whether it is worth registering with a provider at all. The trial exists to
        be evaluated, not used: it is limited to the smallest model, it is not part of any paid
        plan, and it may be reduced or withdrawn at any time.
      </p>

      <h2>Your content</h2>
      <p>
        Conversations, generated images and provider keys you add belong to you. You can delete a
        conversation, remove a key, or delete your account, and doing so removes them here.
      </p>
      <p>
        Text you send is forwarded to whichever provider answers, under that provider&apos;s terms.
        Free tiers are not a confidentiality guarantee. Do not send anything confidential through
        one. See <Link href="/privacy">the privacy page</Link> for exactly what is stored.
      </p>

      <h2>What you may not do</h2>
      <ul>
        <li>Share your account or your API keys for this service with other people.</li>
        <li>
          Use it to break a provider&apos;s terms, to work around a rate limit, or to spread the
          load of one workload across several provider accounts you do not own.
        </li>
        <li>Send content that is illegal where you are, or that targets or harasses a person.</li>
        <li>
          Automate beyond the published per-account request ceiling, or otherwise make this
          service&apos;s traffic look abusive to a provider — that consequence lands on every other
          user.
        </li>
      </ul>

      <h2>Availability</h2>
      <p>
        This is provided as it is, with no warranty and no uptime commitment. It depends on
        providers whose free tiers can change or disappear without notice, and one of them already
        has. Do not build anything you cannot afford to lose on top of it.
      </p>

      <h2>Changes and ending</h2>
      <p>
        These terms may change; material changes will be shown before they take effect. You can stop
        at any time by deleting your account. We may suspend an account that breaks the rules above,
        and will say which one.
      </p>

      <h2>Contact</h2>
      <p className="muted">
        Add the operating entity and a contact address here before accepting real users. Until that
        is filled in, treat this page as a draft.
      </p>
    </main>
  )
}
