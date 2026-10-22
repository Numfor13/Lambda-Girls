export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }

  get isOffline() {
    return this.status === 0
  }
}

const FRIENDLY: Record<number, string> = {
  0: "You're offline. We'll try again when you're back online.",
  400: "Something in the form isn't right. Please check and try again.",
  401: "Please sign in again to continue.",
  403: "You don't have access to this.",
  404: "We couldn't find that.",
  409: "This was already saved.",
  429: "Too many requests. Please wait a moment.",
}

export function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    return FRIENDLY[error.status] ?? "Something went wrong on our side. Please try again."
  }
  return "Something went wrong. Please try again."
}
