export interface PendingQuestion {
  readonly question: string
  readonly resolve: (allowed: boolean) => void
}

/**
 * Holds the one question awaiting an answer.
 *
 * Pulled out of the React hook so the rules can be tested: every path that ends
 * without a person pressing "Do it" must resolve *false*. A confirmation that
 * defaulted to yes when the panel closed would be the worst possible bug in
 * this whole feature, and one that never resolved would hang the agent.
 */
export class ConfirmQueue {
  private live: PendingQuestion | null = null

  ask(question: string, onChange: (pending: PendingQuestion | null) => void): Promise<boolean> {
    // Only one gate can be shown, so a new question declines the old one rather
    // than leaving its promise dangling.
    this.live?.resolve(false)
    return new Promise<boolean>((resolve) => {
      this.live = { question, resolve }
      onChange(this.live)
    })
  }

  answer(allowed: boolean, onChange: (pending: PendingQuestion | null) => void): void {
    this.live?.resolve(allowed)
    this.live = null
    onChange(null)
  }

  /** Called when the panel goes away. Anything still open is a no. */
  abandon(): void {
    this.live?.resolve(false)
    this.live = null
  }

  get pending(): PendingQuestion | null {
    return this.live
  }
}
