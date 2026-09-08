import type { ProviderInfo, Session } from './session'

export interface ModelOption {
  readonly id: string
  readonly label: string
  readonly providerLabel: string
  readonly contextWindow: number
}

/**
 * Only providers the user actually holds a key for. In direct mode the others
 * cannot answer, so offering them would be a menu of guaranteed failures.
 */
export function pickableModels(session: Session): ModelOption[] {
  return session.providers
    .filter((provider: ProviderInfo) => provider.key !== null)
    .flatMap((provider) =>
      provider.models.map((model) => ({
        id: `${provider.id}:${model.id}`,
        label: model.label,
        providerLabel: provider.label,
        contextWindow: model.contextWindow,
      })),
    )
}
