import Link from 'next/link'
import { orderedProviders } from '@zca/providers'
import { safeAuth } from '@/auth'
import { runtimeConfig } from '@/config'
import ModelShowcase from '@/components/model-showcase'

export const dynamic = 'force-dynamic'

export default async function LandingPage() {
  const session = await safeAuth()
  const signedIn = session?.user !== undefined
  const trial = runtimeConfig().DEMO_MESSAGES_PER_ACCOUNT_PER_DAY

  return (
    <main>
      <section className="hero">
        <h1>Your keys. One interface.</h1>
        <p className="lead">
          Groq and Cloudflare give away real AI capacity for free, to anyone, without a card. This
          is the software that makes that usable: one chat, one API and a browser extension over the
          accounts you already own.
        </p>
        <div className="row">
          <Link href={signedIn ? '/chat' : '/register'}>
            <button className="primary" type="button">
              {signedIn ? 'Open the chat' : 'Create an account'}
            </button>
          </Link>
          <Link href={signedIn ? '/dashboard/keys' : '/signin'}>
            <button type="button">{signedIn ? 'Connect your keys' : 'Sign in'}</button>
          </Link>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 18 }}>
          {trial} messages a day to try it without any keys at all.
        </p>
      </section>

      <section className="section">
        <div className="inner">
          <h2>What this is, and what it is not</h2>
          <div className="steps">
            <div className="step">
              <strong>It is an interface.</strong>
              <p className="muted">
                Routing between providers, failover when one is rate limited, conversation history,
                a side panel in your browser, an OpenAI-compatible API, voice input, page reading.
              </p>
            </div>
            <div className="step">
              <strong>It is not a model provider.</strong>
              <p className="muted">
                No model access is sold or resold here. You register with Groq and Cloudflare
                yourself, the keys and the quota are yours, and the relationship with them is yours.
                We never see your quota; we spend it on your instruction.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="inner">
          <h2>Three steps, about five minutes</h2>
          <div className="steps">
            <div className="step">
              <div className="n">1</div>
              <strong>Get your own keys</strong>
              <p className="muted">
                Free at both providers below. No credit card, no trial period, nothing to cancel.
              </p>
              <div>
                {orderedProviders().map((provider) => (
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
            <div className="step">
              <div className="n">2</div>
              <strong>Paste them in once</strong>
              <p className="muted">
                Encrypted before storage, and they follow you to every device and to the extension.
                Remove them and nothing of yours is left behind.
              </p>
            </div>
            <div className="step">
              <div className="n">3</div>
              <strong>Use them everywhere</strong>
              <p className="muted">
                The same keys answer in the web chat, in the side panel on any tab, and through your
                own API keys from your own code.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ModelShowcase />

      <section className="section">
        <div className="inner">
          <h2>It counts what you did not spend</h2>
          <p className="muted">
            Every answered request is priced against a paid model and shown per provider in your
            dashboard. An estimate, not a bill — and deliberately measured against an inexpensive
            model, because a counter that flatters itself measures nothing.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="inner">
          <h2>What we store</h2>
          <ul className="muted">
            <li>Your conversations, so you can come back to them. You can delete them.</li>
            <li>Your provider keys, encrypted, under a key held outside the database.</li>
            <li>
              Per request: provider, model, token counts, latency, status, timestamp. Never the
              text.
            </li>
          </ul>
          <div className="row">
            <Link href="/privacy">
              <button type="button">Privacy</button>
            </Link>
            <Link href="/terms">
              <button type="button">Terms</button>
            </Link>
          </div>
        </div>
      </section>

      <section className="section" style={{ textAlign: 'center' }}>
        <div className="inner">
          <h2>Bring your own keys</h2>
          <p className="muted">They are free, they are yours, and they stay yours.</p>
          <Link href={signedIn ? '/dashboard/keys' : '/register'}>
            <button className="primary" type="button">
              {signedIn ? 'Connect your keys' : 'Create an account'}
            </button>
          </Link>
        </div>
      </section>
    </main>
  )
}
