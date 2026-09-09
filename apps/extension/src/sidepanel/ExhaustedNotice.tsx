import { SITE_URL } from '@/lib/config'

/** Hard constraint 2: a spent cap is an invitation, never an error. */
export default function ExhaustedNotice({
  options,
}: {
  options: { label: string; url: string }[]
}) {
  return (
    <div className="notice">
      <strong>Today&apos;s free messages are used up.</strong>
      <p className="muted" style={{ margin: '0 0 8px' }}>
        Add a free key of your own and this cap stops applying.
      </p>
      {options.map((item) => (
        <div key={item.url}>
          <a href={item.url} target="_blank" rel="noreferrer">
            Get a free {item.label} key
          </a>
        </div>
      ))}
      <a href={`${SITE_URL}/settings/keys`} target="_blank" rel="noreferrer">
        Then add it to your account
      </a>
    </div>
  )
}
