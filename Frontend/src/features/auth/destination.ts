import type { Session } from "@/auth/session"
import { homeFor } from "@/auth/AuthProvider"

/** Only return to a local route belonging to the signed-in role. */
export function safeReturn(raw: string | null | undefined): string | null {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    [...raw].some((char) => char.charCodeAt(0) < 32)
  )
    return null
  const path = raw.split(/[?#]/)[0]
  if (path === "/" || path.startsWith("/sign-in") || path.startsWith("/auth/"))
    return null
  return raw
}
export function authDestination(
  session: Session,
  raw: string | null | undefined
): string {
  const target = safeReturn(raw)
  const doctorRoute = target?.split(/[?#]/)[0]
  const isDoctorRoute =
    doctorRoute === "/doctor" || doctorRoute?.startsWith("/doctor/")
  return target && Boolean(isDoctorRoute) === session.groups.includes("Doctor")
    ? target
    : homeFor(session)
}
