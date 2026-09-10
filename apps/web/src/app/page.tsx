import type { Metadata } from 'next'
import Link from 'next/link'
import { CODE, GAUGE, GLOBE, MIC, SHIELD, SHUFFLE, SIDEBAR } from '@zca/shared'
import { orderedProviders } from '@zca/providers'
import { safeAuth } from '@/auth'
import { runtimeConfig } from '@/config'
import Icon from '@/components/icon'
import ModelShowcase from '@/components/model-showcase'
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/lib/site'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

/**
 * Provider names are woven through this page. They come from the registry
 * rather than being typed out, because they were typed out once and went stale
 * the day a third provider was added.
 */
function andList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const faq = (names: string) => [
  {
    q: 'Do I need a credit card?',
    a: `No. Every provider here — ${names} — hands out a free tier to anyone with an email, with no card and nothing to cancel. Providers that ask for a payment method are deliberately not listed.`,
  },
  {
    q: 'Are you reselling AI access?',
    a: 'No, and that is the whole design. You register with the providers yourself, the quota is yours, and the account relationship is yours. This is the software that sits in front of it. If you delete your keys, there is nothing of yours left here.',
  },
  {
    q: 'Where do my API keys live?',
    a: 'Encrypted before they touch the database, under a key held outside it, and decrypted only to make the request you asked for. They sync to every device you sign in on, including the browser extension, and deleting them removes them.',
  },
  {
    q: 'What happens when a provider rate limits me?',
    a: 'The router moves to the next provider that has capacity, mid-request, and remembers the one that failed for a cooldown window. You see an answer instead of an error.',
  },
  {
    q: 'Can I use it from my own code?',
    a: 'Yes. There is an OpenAI-compatible endpoint, so any client or SDK that speaks the OpenAI Chat Completions API can point its base URL here and use your own keys through the same failover.',
  },
  {
    q: 'Is my conversation text stored?',
    a: 'Your conversations are stored so you can return to them, and you can delete them. Per-request analytics record provider, model, token counts, latency, status and timestamp — never the text.',
  },
]

export default async function LandingPage() {
  const session = await safeAuth()
  const signedIn = session?.user !== undefined
  const trial = runtimeConfig().DEMO_MESSAGES_PER_ACCOUNT_PER_DAY
  const providers = orderedProviders()
  const models = providers.reduce((sum, provider) => sum + provider.models.length, 0)
  const names = andList(providers.map((provider) => provider.label))
  const questions = faq(names)

  return (
    <main>
      <script
        type="application/ld+json"
        // Serialised JSON, not markup; every value comes from our own modules.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: required for JSON-LD
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData(trial, models, questions)),
        }}
      />

      <section className="l-hero">
        <span className="l-badge l-in">
          <i className="l-dot" />
          <b>Bring your own keys</b> · no credit card, ever
        </span>
        <h1 className="l-title l-in" style={{ animationDelay: '60ms' }}>
          Your keys.
          <br />
          <em>One interface.</em>
        </h1>
        <p className="l-lead l-in" style={{ animationDelay: '120ms' }}>
          {names} give away real AI capacity for free, to anyone, without a card. This is the
          software that makes it usable: one chat, one API and a browser side panel over the
          accounts you already own.
        </p>
        <div className="l-cta l-in" style={{ animationDelay: '180ms' }}>
          <Link href={signedIn ? '/chat' : '/register'}>
            <button className="primary" type="button">
              {signedIn ? 'Open the chat' : 'Start free'}
            </button>
          </Link>
          <Link href={signedIn ? '/settings/keys' : '/signin'}>
            <button type="button">{signedIn ? 'Connect your keys' : 'Sign in'}</button>
          </Link>
        </div>
        <p className="l-fine l-in" style={{ animationDelay: '240ms' }}>
          <b>{trial} messages a day</b> to try it with no keys at all
        </p>

        <div className="l-mockwrap l-in" style={{ animationDelay: '300ms' }}>
          <div className="l-mock">
            <div className="l-chrome">
              <i />
              <i />
              <i />
              <span>{SITE_NAME} — chat</span>
            </div>
            <div className="l-body">
              <div className="l-msg you">Summarise this page and tell me what it costs.</div>
              <div className="l-msg ai">
                Nothing. The request went to your own Groq account, and the page was read on your
                instruction.
                <span className="l-src">gpt-oss-120b · 412ms · $0.00</span>
              </div>
            </div>
            <div className="l-mockbar">
              <span className="l-round">+</span>
              <span className="l-grow">Ask anything…</span>
              <span className="l-round">Eco</span>
              <span className="l-round">
                <Icon shape={MIC} size={13} />
              </span>
              <span className="l-round go">↑</span>
            </div>
          </div>
        </div>

        <div className="l-strip">
          <div className="l-track">
            {[0, 1].map((copy) => (
              // Duplicated so the marquee can loop without a visible seam.
              <div key={copy} style={{ display: 'flex', gap: 46 }} aria-hidden={copy === 1}>
                {providers.map((provider) => (
                  <span key={provider.id}>{provider.label}</span>
                ))}
                <span>OpenAI-compatible API</span>
                <span>Chrome side panel</span>
                <span>Voice input</span>
                <span>Page reading</span>
                <span>Encrypted key vault</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="l-stats">
        <div>
          <strong>{models}</strong>
          <small>models your keys unlock</small>
        </div>
        <div>
          <strong>$0</strong>
          <small>paid to us, or to them</small>
        </div>
        <div>
          <strong>{providers.length}</strong>
          <small>providers, no card needed</small>
        </div>
        <div>
          <strong>1</strong>
          <small>place to paste a key</small>
        </div>
      </div>

      <section className="l-sec">
        <p className="l-eyebrow">Why it exists</p>
        <h2 className="l-h2">Free capacity is real. Using it is the annoying part.</h2>
        <p className="l-sub">
          Every provider has its own console, its own key format, its own rate limit and its own
          failure mode. This puts one interface over all of them and keeps the accounts yours.
        </p>
        <div className="l-bento">
          <div className="l-card wide">
            <span className="l-ico">
              <Icon shape={SHUFFLE} size={17} />
            </span>
            <h3>Failover, mid-request</h3>
            <p>
              When a provider rate limits you, the router moves to the next one that has capacity
              and remembers the failure for a cooldown window. You get an answer, not a 429.
            </p>
          </div>
          <div className="l-card wide">
            <span className="l-ico">
              <Icon shape={SHIELD} size={17} />
            </span>
            <h3>Keys encrypted, and yours</h3>
            <p>
              Encrypted before storage under a key held outside the database, synced to every device
              and to the extension. Remove them and nothing of yours is left behind.
            </p>
          </div>
          <div className="l-card">
            <span className="l-ico">
              <Icon shape={SIDEBAR} size={17} />
            </span>
            <h3>A panel on any tab</h3>
            <p>
              The extension reads the page you are on, when you ask it to, and answers beside it.
            </p>
          </div>
          <div className="l-card">
            <span className="l-ico">
              <Icon shape={MIC} size={17} />
            </span>
            <h3>Talk to it</h3>
            <p>Voice input transcribed through your own key, in the web app and the panel.</p>
          </div>
          <div className="l-card">
            <span className="l-ico">
              <Icon shape={GLOBE} size={17} />
            </span>
            <h3>Reads links</h3>
            <p>
              Paste a URL and the page is fetched, stripped to text and put in the conversation.
            </p>
          </div>
          <div className="l-card full">
            <span className="l-ico">
              <Icon shape={CODE} size={17} />
            </span>
            <h3>OpenAI-compatible, so your code already works</h3>
            <p>
              Point any OpenAI client at your own endpoint and it runs through the same keys and the
              same failover.
            </p>
            <pre className="l-code">
              <i># any OpenAI SDK, unchanged</i>
              {'\n'}client = OpenAI({'\n'}
              {'  '}base_url=<b>&quot;{siteUrl('/api/v1')}&quot;</b>,{'\n'}
              {'  '}api_key=<b>&quot;zca_your_key&quot;</b>,{'\n'})
            </pre>
          </div>
          <div className="l-card full">
            <span className="l-ico">
              <Icon shape={GAUGE} size={17} />
            </span>
            <h3>It counts what you did not spend</h3>
            <p>
              Every answered request is priced against a paid model and shown per provider in your
              settings. An estimate, not a bill — and measured against an inexpensive model on
              purpose, because a counter that flatters itself measures nothing.
            </p>
          </div>
        </div>
      </section>

      <section className="l-sec">
        <p className="l-eyebrow">Straight answer</p>
        <h2 className="l-h2">What this is, and what it is not</h2>
        <div className="l-pair">
          <div className="is">
            <h3>It is an interface</h3>
            <p>
              Routing between providers, failover when one is rate limited, conversation history, a
              side panel in your browser, an OpenAI-compatible API, voice input and page reading.
            </p>
          </div>
          <div>
            <h3>It is not a model provider</h3>
            <p>
              No model access is sold or resold here. You register with {names} yourself, the keys
              and the quota are yours, and the relationship with them is yours. We never see your
              quota; we spend it on your instruction.
            </p>
          </div>
        </div>
      </section>

      <section className="l-sec">
        <p className="l-eyebrow">Setup</p>
        <h2 className="l-h2">Three steps, about five minutes</h2>
        <div className="l-steps">
          <div className="l-stepcard">
            <h3>Get your own keys</h3>
            <p>Free at every provider below. No credit card, no trial period, nothing to cancel.</p>
            <div>
              {providers.map((provider) => (
                <a
                  key={provider.id}
                  className="pill"
                  href={provider.signupUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {provider.label} →
                </a>
              ))}
            </div>
          </div>
          <div className="l-stepcard">
            <h3>Paste them in once</h3>
            <p>
              Encrypted before storage, and they follow you to every device and to the extension.
            </p>
          </div>
          <div className="l-stepcard">
            <h3>Use them everywhere</h3>
            <p>
              The same keys answer in the web chat, in the side panel on any tab, and through your
              own API keys from your own code.
            </p>
          </div>
        </div>
      </section>

      <ModelShowcase />

      <section className="l-sec">
        <p className="l-eyebrow">Questions</p>
        <h2 className="l-h2">The ones worth asking first</h2>
        <div className="l-faq">
          {questions.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="l-final">
        <h2 className="l-h2 l-center" style={{ margin: '0 auto 14px' }}>
          Bring your own keys
        </h2>
        <p className="l-sub l-center" style={{ margin: '0 auto 28px' }}>
          They are free, they are yours, and they stay yours.
        </p>
        <div className="l-cta">
          <Link href={signedIn ? '/settings/keys' : '/register'}>
            <button className="primary" type="button">
              {signedIn ? 'Connect your keys' : 'Create an account'}
            </button>
          </Link>
          <Link href="/privacy">
            <button type="button">Read the privacy page</button>
          </Link>
        </div>
      </section>

      <footer className="l-foot">
        <span>
          © {new Date().getFullYear()} {SITE_NAME}
        </span>
        <span className="spacer" />
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/signin">Sign in</Link>
      </footer>
    </main>
  )
}

/**
 * Describes the product to search engines the way the page describes it to a
 * reader: software you point at your own provider accounts, not a model seller.
 * The FAQ block mirrors the visible questions, which is the only form Google
 * accepts.
 */
function structuredData(
  trial: number,
  models: number,
  questions: readonly { q: string; a: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        url: siteUrl('/'),
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web, Chrome',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: `Free with your own provider keys, plus ${trial} messages a day without any.`,
        },
        featureList: [
          `Automatic failover across ${models} free models`,
          'OpenAI-compatible API',
          'Browser side panel',
          'Voice input',
          'Page reading',
          'Encrypted storage of your own provider keys',
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: questions.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  }
}
