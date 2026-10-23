export const SERVICE_DRAFT_PREFIX = "cb_service_draft:"
export function clearServiceDrafts() {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(SERVICE_DRAFT_PREFIX)) localStorage.removeItem(key)
  } catch {
    /* Storage may be blocked. */
  }
}
