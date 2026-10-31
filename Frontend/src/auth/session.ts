import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts"
import { authConfigured, staffAuthConfigured, env } from "@/config/env"

export type Role = "Patient" | "Doctor" | "Operator" | "Admin"

export interface Session {
  sub: string
  name: string
  email?: string
  phone?: string
  groups: Role[]
  idToken: string
  demo: boolean
}

const DEMO_KEY = "cb_demo_session"

export type AuthMode = "patient" | "staff"
const MODE_KEY = "cb_auth_mode"
const managers: Partial<Record<AuthMode, UserManager>> = {}
export function getAuthMode(): AuthMode {
  return sessionStorage.getItem(MODE_KEY) === "staff" ? "staff" : "patient"
}
export function selectAuthMode(mode: AuthMode) {
  sessionStorage.setItem(MODE_KEY, mode)
}
export function getUserManager(
  mode: AuthMode = getAuthMode()
): UserManager | null {
  const config = mode === "staff" ? env.cognitoStaff : env.cognito
  if (!config.authority || !config.clientId) return null
  return (managers[mode] ??= new UserManager({
    authority: config.authority,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    post_logout_redirect_uri: window.location.origin,
    response_type: "code",
    scope: mode === "staff" ? "openid email profile" : "openid email",
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  }))
}

/**
 * Redirect to Cognito's signup page while still using oidc-client-ts state
 * management so the callback can exchange the code after account creation.
 */
export async function signUpRedirect(returnTo?: string): Promise<void> {
  const um = getUserManager()
  if (!um) return
  await um.signinRedirect({ state: { returnTo: returnTo ?? "/app" } })
}

export function sessionFromUser(
  user: User,
  mode: AuthMode = getAuthMode()
): Session {
  const p = user.profile as Record<string, unknown>
  const groups = Array.isArray(p["cognito:groups"])
    ? (p["cognito:groups"] as Role[])
    : []
  return {
    sub: String(p.sub),
    name: String(
      p.name ?? p.given_name ?? p.email ?? p.phone_number ?? "there"
    ),
    email: typeof p.email === "string" ? p.email : undefined,
    phone: typeof p.phone_number === "string" ? p.phone_number : undefined,
    groups:
      mode === "staff"
        ? groups.filter((g) => ["Doctor", "Operator", "Admin"].includes(g))
        : ["Patient"],
    idToken: user.id_token ?? "",
    demo: false,
  }
}

export function readDemoSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(DEMO_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function writeDemoSession(role: Role): Session {
  selectAuthMode(role === "Patient" ? "patient" : "staff")
  const session: Session = {
    sub: `demo-${role.toLowerCase()}-1`,
    name: {
      Patient: "Ngozi",
      Doctor: "Dr. Ambe T.",
      Operator: "Demo operator",
      Admin: "Demo administrator",
    }[role],
    phone: "+237677000000",
    groups: [role],
    idToken: `demo.${role}`,
    demo: true,
  }
  sessionStorage.setItem(DEMO_KEY, JSON.stringify(session))
  return session
}

export function clearDemoSession() {
  sessionStorage.removeItem(DEMO_KEY)
}

export async function currentSession(): Promise<Session | null> {
  const um = getUserManager()
  if (um) {
    const user = await um.getUser()
    return user && !user.expired ? sessionFromUser(user) : null
  }
  return !authConfigured && !staffAuthConfigured ? readDemoSession() : null
}

/** Token passed to the mock API so it can tell patients and doctors apart. */
export async function getAccessToken(): Promise<string | null> {
  const s = await currentSession()
  return s ? `${s.sub}|${s.groups.join(",")}` : null
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const s = await currentSession()
  return s?.idToken ? { Authorization: `Bearer ${s.idToken}` } : {}
}
