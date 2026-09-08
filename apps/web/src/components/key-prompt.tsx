import Link from 'next/link'

/**
 * Hard constraint 2: an exhausted cap is not an error. This is an invitation,
 * and it never uses error styling.
 */
export default function KeyPrompt({
  providers,
}: {
  providers: { providerId: string; label: string; signupUrl: string }[]
}) {
  return (
    <div className="card">
      <strong>You have used today&apos;s free messages.</strong>
      <p className="muted" style={{ marginBottom: 8 }}>
        Add a free key of your own and this cap stops applying to you.
      </p>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {providers.map((item) => (
          <a key={item.providerId} href={item.signupUrl} target="_blank" rel="noreferrer">
            Get a free {item.label} key
          </a>
        ))}
        <Link href="/dashboard/keys">
          <button type="button" className="primary">
            Add it here
          </button>
        </Link>
      </div>
    </div>
  )
}
