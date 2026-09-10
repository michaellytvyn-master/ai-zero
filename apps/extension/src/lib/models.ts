import type { ProviderInfo, Session } from './session'

export interface ModelOption {
  readonly id: string
  readonly label: string
  readonly providerId: string
  readonly providerLabel: string
  readonly contextWindow: number
}

/**
 * Only providers the user actually holds a key for. In direct mode the others
 * cannot answer, so offering them would be a menu of guaranteed failures.
 */
export function pickableModels(session: Session): ModelOption[] {
  return keyedProviders(session).flatMap((provider) =>
    provider.models.map((model) => ({
      id: `${provider.id}:${model.id}`,
      label: model.label,
      providerId: provider.id,
      providerLabel: provider.label,
      contextWindow: model.contextWindow,
    })),
  )
}

export interface ModelGroup {
  readonly providerId: string
  readonly providerLabel: string
  readonly models: ModelOption[]
}

/**
 * The picker is a plain <select>; with three providers and eighteen models a
 * flat list gives no clue who answers. Grouping keeps the native control and
 * makes the ownership obvious.
 */
export function groupedModels(session: Session): ModelGroup[] {
  const groups = new Map<string, ModelGroup>()
  for (const model of pickableModels(session)) {
    const existing = groups.get(model.providerId)
    if (existing === undefined) {
      groups.set(model.providerId, {
        providerId: model.providerId,
        providerLabel: model.providerLabel,
        models: [model],
      })
    } else {
      existing.models.push(model)
    }
  }
  return [...groups.values()]
}

function keyedProviders(session: Session): ProviderInfo[] {
  return session.providers.filter((provider) => provider.key !== null)
}

/**
 * The caution to show beside the composer, if any.
 *
 * Shown when the provider that will actually answer reserves rights over what
 * is sent. "auto" only counts when that provider is the only one with a key,
 * because auto runs in priority order and would otherwise reach it last, if at
 * all — warning about a provider that will not be used trains people to ignore
 * the warning.
 *
 * Page reading turns this from an abstraction into a specific: the page in
 * front of the user is what gets sent.
 */
export function activeWarning(
  session: Session,
  model: string,
  pageReadingOn: boolean,
): string | null {
  const keyed = keyedProviders(session)
  const answering =
    model === 'auto'
      ? keyed.length === 1
        ? keyed[0]
        : undefined
      : keyed.find((provider) => model.startsWith(`${provider.id}:`))

  if (answering?.privacyWarning === undefined) return null

  return pageReadingOn
    ? `${answering.label} reads what you send on its free tier — including the page below.`
    : `${answering.label} reads what you send on its free tier.`
}
