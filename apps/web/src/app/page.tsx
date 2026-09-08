import Link from 'next/link'
import { listModels, orderedProviders } from '@zca/providers'
import { referenceModel } from '@zca/pricing'
import { safeAuth } from '@/auth'

export const dynamic = 'force-dynamic'

export default async function LandingPage() {
  const session = await safeAuth()
  const signedIn = session?.user !== undefined
  const models = listModels()
  const reference = referenceModel()

  return (
    <main>
      <section className="hero">
        <h1>Chat that runs on free provider tiers</h1>
        <p className="lead">
          {models.length} models across {orderedProviders().length} providers, none of which asks
          for a credit card. When one is rate limited or down, the next one answers and the reply
          tells you who it was.
        </p>
        <div className="row">
          <Link href={signedIn ? '/chat' : '/register'}>
            <button className="primary" type="button">
              {signedIn ? 'Open the chat' : 'Create a free account'}
            </button>
          </Link>
          <Link href={signedIn ? '/dashboard' : '/signin'}>
            <button type="button">{signedIn ? 'Dashboard' : 'Sign in'}</button>
          </Link>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 18 }}>
          Email and password, or Google. No card, no trial, no billing.
        </p>
      </section>

      <section className="section">
        <div className="inner">
          <h2>How it works</h2>
          <div className="steps">
            <div className="step">
              <div className="n">1</div>
              <strong>Create an account</strong>
              <p className="muted">
                Your conversations live on it, so you can pick one up on another machine or in the
                browser extension.
              </p>
            </div>
            <div className="step">
              <div className="n">2</div>
              <strong>Start on the shared pool</strong>
              <p className="muted">
                A few free messages a day on the smallest model, on our keys, with nothing to set
                up.
              </p>
            </div>
            <div className="step">
              <div className="n">3</div>
              <strong>Add your own free keys</strong>
              <p className="muted">
                Then the daily cap stops applying, every model opens up, and requests go straight
                from your browser to the provider.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="inner">
          <h2>Models you can choose</h2>
          <p className="muted">
            Pick per message. History is stored on the server rather than inside a model, so you can
            answer the next turn of the same conversation with a different one.
          </p>
          {orderedProviders().map((provider) => (
            <div key={provider.id} style={{ marginBottom: 18 }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <strong>{provider.label}</strong>
                <span className="pill" style={{ margin: 0 }}>
                  free, no card
                </span>
              </div>
              <div>
                {provider.models.map((model) => (
                  <span key={model.id} className="pill">
                    {model.label} · {Math.round(model.contextWindow / 1000)}k
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 13 }}>
            Verified against each provider&apos;s own documentation on 2026-09-08. Providers that
            require a payment method are not listed, however good they are.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="inner">
          <h2>It counts what you did not spend</h2>
          <p className="muted">
            Every answered request is priced against {reference.label} at $
            {reference.inputPerMillionUsd}/M input and ${reference.outputPerMillionUsd}/M output,
            and shown per provider in your dashboard.
          </p>
          <p className="muted">
            It is an estimate, not a bill, and it deliberately compares against an inexpensive model
            rather than a flagship — a counter that flatters itself measures nothing.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="inner">
          <h2>What we store</h2>
          <ul className="muted">
            <li>Your conversations, so you can come back to them. You can delete them.</li>
            <li>
              Provider keys, encrypted with AES-256-GCM under a key held outside the database.
            </li>
            <li>
              Per request: provider, model, token counts, latency, status, timestamp. Never the
              text.
            </li>
          </ul>
          <Link href="/privacy">
            <button type="button">Read the details</button>
          </Link>
        </div>
      </section>

      <section className="section" style={{ textAlign: 'center' }}>
        <div className="inner">
          <h2>Start without a card</h2>
          <Link href={signedIn ? '/chat' : '/register'}>
            <button className="primary" type="button">
              {signedIn ? 'Open the chat' : 'Create a free account'}
            </button>
          </Link>
        </div>
      </section>
    </main>
  )
}
