import { redirect } from 'next/navigation'
import { safeAuth } from '@/auth'
import PasswordForm from '@/components/password-form'
import { revokeExtension } from '@/actions/account'
import { isGoogleConfigured } from '@/config'
import { hasPassword } from '@/lib/accounts'
import { listExtensionSessions } from '@/lib/extension-auth'
import { MIN_PASSWORD_LENGTH } from '@/lib/password'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await safeAuth()
  const account = session?.user
  if (account?.id === undefined) redirect('/signin')
  const userId = account.id

  const [passwordSet, extensions] = await Promise.all([
    hasPassword(userId),
    listExtensionSessions(userId),
  ])

  return (
    <>
      <h1>Sign-in and devices</h1>

      <div className="card">
        <strong>{account.email}</strong>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Signs in with {passwordSet ? 'a password' : 'Google only'}
          {passwordSet && isGoogleConfigured() ? ', and with Google' : ''}.
        </div>
      </div>

      <h2>{passwordSet ? 'Change password' : 'Set a password'}</h2>
      <p className="muted">
        {passwordSet
          ? 'You will stay signed in on this device.'
          : 'Adds email and password as a second way into this account, alongside Google.'}
      </p>
      <PasswordForm needsCurrent={passwordSet} minLength={MIN_PASSWORD_LENGTH} />

      <h2 style={{ marginTop: 32 }}>Browser extension</h2>
      {extensions.length === 0 ? (
        <p className="muted">
          No extension is connected. Install it, open the side panel and sign in there.
        </p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Connected</th>
                <th>Last seen</th>
                <th>Expires</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {extensions.map((item) => (
                <tr key={item.id}>
                  <td>{item.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="muted">
                    {item.lastSeenAt.toISOString().slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="muted">{item.expiresAt.toISOString().slice(0, 10)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <form action={revokeExtension}>
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit">Revoke</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 13 }}>
        Revoking signs that browser out. Your provider keys stay on your account.
      </p>
    </>
  )
}
