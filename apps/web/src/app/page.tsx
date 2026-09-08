import Link from 'next/link'
import { orderedProviders } from '@zca/providers'

export default function LandingPage() {
  return (
    <main className="wrap">
      <h1>A chat that runs on free provider tiers</h1>
      <p className="muted">
        Requests fan out across several providers and fail over automatically when one is rate
        limited or down. Add your own free API keys and you are not sharing anyone&apos;s quota.
      </p>

      <div className="row" style={{ margin: '24px 0' }}>
        <Link href="/signin">
          <button type="button" className="primary">
            Sign in with Google
          </button>
        </Link>
        <Link href="/privacy">
          <button type="button">What we store</button>
        </Link>
      </div>

      <h2>Providers</h2>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Order</th>
            <th>Free tier</th>
            <th>Get a key</th>
          </tr>
        </thead>
        <tbody>
          {orderedProviders().map((provider) => {
            const free = provider.models.some((model) => model.free)
            return (
              <tr key={provider.id}>
                <td>{provider.label}</td>
                <td className="muted">{provider.priority}</td>
                <td>{free ? 'yes, no card' : 'paid or trial credit only'}</td>
                <td>
                  <a href={provider.signupUrl} target="_blank" rel="noreferrer">
                    Sign up
                  </a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 13 }}>
        Limits verified 2026-09-08. Cerebras retired its no-card free tier in August 2026, so it is
        last and only runs if you bring credits.
      </p>
    </main>
  )
}
