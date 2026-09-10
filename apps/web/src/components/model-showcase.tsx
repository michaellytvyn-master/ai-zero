import { orderedProviders } from '@zca/providers'

/**
 * Framed as what a user's own keys unlock, not as a catalogue this service
 * offers. The distinction is the whole legal position of the product.
 */
export default function ModelShowcase() {
  const providers = orderedProviders()
  const total = providers.reduce((sum, provider) => sum + provider.models.length, 0)

  return (
    <section className="l-sec">
      <p className="l-eyebrow">The catalogue is yours</p>
      <h2 className="l-h2">What your keys unlock</h2>
      <p className="l-sub">
        {total} models across {providers.length} accounts, picked per message. History lives on your
        account rather than inside a model, so you can answer the next turn of the same conversation
        with a different one.
      </p>
      {providers.map((provider) => (
        <div className="l-provider" key={provider.id}>
          <div className="l-phead">
            <strong>{provider.label}</strong>
            <span className="l-yours">your account</span>
          </div>
          <div>
            {provider.models.map((model) => (
              <span key={model.id} className="l-tag">
                {model.label} <b>{Math.round(model.contextWindow / 1000)}k</b>
              </span>
            ))}
          </div>
        </div>
      ))}
      <p className="muted" style={{ fontSize: 13, marginTop: 22 }}>
        Limits verified against each provider&apos;s own documentation on 2026-09-09, and context
        sizes read from their catalogues at runtime. Providers that require a payment method are not
        listed.
      </p>
    </section>
  )
}
