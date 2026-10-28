import { apiUrls, env } from "@/config/env"
import { ApiError } from "./errors"
import { mockRequest } from "./mock"
import type { Consultation, Message } from "./types"

export interface AnonymousSession {
  session_token: string
  expires_at: number
}
const KEY = "cb_anonymous_session"
export function readAnonymousSession(): AnonymousSession | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(KEY) || "null"
    ) as AnonymousSession | null
    return value &&
      typeof value.session_token === "string" &&
      Number.isFinite(value.expires_at)
      ? value
      : null
  } catch {
    return null
  }
}
export function storeAnonymousSession(session: AnonymousSession) {
  localStorage.setItem(KEY, JSON.stringify(session))
}
export function forgetAnonymousSession() {
  localStorage.removeItem(KEY)
  for (const key of Object.keys(localStorage))
    if (key.startsWith("cb_anonymous_outbox:") || key.includes(":anonymous:"))
      localStorage.removeItem(key)
}

async function anonymousRequest<T>(
  path: string,
  token?: string,
  body?: unknown
): Promise<T> {
  const method = body === undefined ? "GET" : "POST"
  if (env.useMockApi)
    return mockRequest<T>(
      method,
      `/anonymous${path}`,
      body,
      token ? `anon:${token}` : null
    )
  let response: Response
  try {
    response = await fetch(`${apiUrls.anonymous}/anonymous${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": document.documentElement.lang || "en",
        ...(token ? { "X-Anonymous-Session": token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    throw new ApiError(0, "Network unavailable")
  }
  const data: unknown = await response.json()
  if (!response.ok)
    throw new ApiError(
      response.status,
      data && typeof data === "object" && "error" in data
        ? String(data.error)
        : response.statusText
    )
  return data as T
}
export const anonymousApi = {
  start: () => anonymousRequest<AnonymousSession>("/session", undefined, {}),
  list: (token: string) =>
    anonymousRequest<{ consultations: Consultation[]; count: number }>(
      "/consultations",
      token
    ),
  create: (token: string, complaint: string) =>
    anonymousRequest<Consultation>("/consultations", token, { complaint }),
  get: (token: string, id: string) =>
    anonymousRequest<{ consultation: Consultation; messages: Message[] }>(
      `/consultations/${encodeURIComponent(id)}`,
      token
    ),
  message: (
    token: string,
    id: string,
    body: { text_body: string; client_message_id: string }
  ) =>
    anonymousRequest<Message>(
      `/consultations/${encodeURIComponent(id)}/messages`,
      token,
      body
    ),
  pay: (token: string, id: string, phone: string) =>
    anonymousRequest<{
      payment_id: string
      payment_url: string
      fapshi_ref: string
    }>("/payments/initiate", token, {
      consultation_id: id,
      ...(phone ? { phone } : {}),
      redirect_url: `${window.location.origin}/ask/${encodeURIComponent(id)}`,
    }),
}
