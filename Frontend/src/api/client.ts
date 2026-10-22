import { apiUrls, env, type ApiService } from "@/config/env"
import { getAccessToken, getAuthHeaders } from "@/auth/session"
import { ApiError } from "./errors"
import { mockRequest } from "./mock"

export { ApiError, friendlyError } from "./errors"

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE"
  body?: unknown
  query?: Record<string, string | undefined>
  auth?: boolean
}

export async function request<T>(
  service: ApiService,
  path: string,
  { method = "GET", body, query, auth = true }: RequestOptions = {},
): Promise<T> {
  const qs = query
    ? new URLSearchParams(
        Object.entries(query).filter((e): e is [string, string] => e[1] !== undefined),
      ).toString()
    : ""
  const fullPath = qs ? `${path}?${qs}` : path

  if (env.useMockApi) {
    return mockRequest<T>(method, fullPath, body, auth ? await getAccessToken() : null)
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept-Language": document.documentElement.lang || "en",
  }
  if (auth) Object.assign(headers, await getAuthHeaders())

  let res: Response
  try {
    res = await fetch(`${apiUrls[service]}${fullPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, "Network unavailable")
  }

  const text = await res.text()
  const data = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data ? String(data.error) : res.statusText
    throw new ApiError(res.status, message)
  }
  return data as T
}
