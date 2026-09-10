import type { Pending } from './use-confirm'

/**
 * The stop before anything irreversible. Deliberately plain and specific: it
 * names the element and why it was stopped, because a dialog that says only
 * "are you sure?" teaches people to press yes.
 */
export default function ConfirmGate({
  pending,
  onAnswer,
}: {
  pending: Pending
  onAnswer: (allowed: boolean) => void
}) {
  return (
    <div className="gate" role="alertdialog" aria-label="Confirm this action">
      <p className="what">{pending.question}</p>
      <div className="row">
        <button type="button" onClick={() => onAnswer(false)}>
          Don’t
        </button>
        <button type="button" className="primary" onClick={() => onAnswer(true)}>
          Do it
        </button>
      </div>
    </div>
  )
}
