export interface CooldownStore {
  isCoolingDown(providerId: string): Promise<boolean>
  startCooldown(providerId: string, seconds: number): Promise<void>
}

/** Used by tests and local dev; production swaps in the Postgres-backed store. */
export class MemoryCooldownStore implements CooldownStore {
  readonly #until = new Map<string, number>()
  readonly #now: () => number

  constructor(now: () => number = Date.now) {
    this.#now = now
  }

  async isCoolingDown(providerId: string): Promise<boolean> {
    const until = this.#until.get(providerId)
    if (until === undefined) return false
    if (this.#now() >= until) {
      this.#until.delete(providerId)
      return false
    }
    return true
  }

  async startCooldown(providerId: string, seconds: number): Promise<void> {
    this.#until.set(providerId, this.#now() + seconds * 1000)
  }
}
