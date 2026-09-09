import { orderedProviders } from '@zca/providers'

/**
 * Framed as what a user's own keys unlock, not as a catalogue this service
 * offers. The distinction is the whole legal position of the product.
 */
export default function ModelShowcase() {
  const providers = orderedProviders()
  const total = providers.reduce((sum, provider) => sum + provider.models.length, 0)

  return (
    <section className="section">
      <div className="inner">
        <h2>What your keys unlock</h2>
        <p className="muted">
          {total} models across {providers.length} accounts, picked per message. History lives on
          your account rather than inside a model, so you can answer the next turn of the same
          conversation with a different one.
        </p>
        {providers.map((provider) => (
          <div key={provider.id} style={{ marginBottom: 18 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <strong>{provider.label}</strong>
              <span className="pill" style={{ margin: 0 }}>
                your account
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
          Limits verified against each provider&apos;s own documentation on 2026-09-08, and context
          sizes read from their catalogues at runtime. Providers that require a payment method are
          not listed.
        </p>
      </div>
    </section>
  )
}
