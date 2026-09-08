export default function PrivacyPage() {
  return (
    <main className="wrap">
      <h1>What we store</h1>

      <h2>Your conversations</h2>
      <p>
        Messages you send and the replies you receive are saved to your account so you can come back
        to them from any device. You can delete a conversation at any time, which removes it from
        our database. Administrators cannot read your conversations.
      </p>

      <h2>Your provider keys</h2>
      <p>
        Keys you add are encrypted with AES-256-GCM before they are written to our database. The
        encryption key is held outside the database, so a database dump alone does not reveal them.
        A key is decrypted only in memory, only while one of your own requests is being served, and
        it is never written to a log.
      </p>

      <h2>Usage records</h2>
      <p>
        For every request we record the provider name, the model, token counts, how long it took,
        the HTTP status and a timestamp. This is what the operator dashboard shows. It never
        includes the content of a prompt or a reply.
      </p>

      <h2>What the providers do with your text</h2>
      <p>
        Your messages are sent to whichever provider answers. Two of the free tiers we use train on
        submitted content:
      </p>
      <ul>
        <li>
          <strong>Mistral</strong> — the free Experiment tier requires opting in to having your
          content used for model training.
        </li>
        <li>
          <strong>Google Gemini</strong> — content submitted on the unpaid tier may be used to
          improve Google&apos;s products, and may be reviewed by people.
        </li>
      </ul>
      <p>
        Do not send anything confidential through a free tier. This applies whether the request runs
        on our shared pool or on a key of your own.
      </p>

      <h2>The Chrome extension</h2>
      <p>
        The extension signs in against this site. When it calls a provider directly using your key,
        it reports back only the metadata listed above — never the text of the request or the reply,
        and never the key.
      </p>
    </main>
  )
}
