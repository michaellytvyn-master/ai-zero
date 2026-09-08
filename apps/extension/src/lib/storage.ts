export async function readLocal<T>(key: string): Promise<T | null> {
  const stored = await chrome.storage.local.get(key)
  return (stored[key] as T | undefined) ?? null
}

export async function writeLocal(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value })
}

export async function clearLocal(key: string): Promise<void> {
  await chrome.storage.local.remove(key)
}
