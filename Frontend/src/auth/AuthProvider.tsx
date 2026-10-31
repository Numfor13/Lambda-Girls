import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  clearDemoSession,
  currentSession,
  getUserManager,
  selectAuthMode,
  getAuthMode,
  type AuthMode,
  sessionFromUser,
  writeDemoSession,
  type Role,
  type Session,
} from "./session"
import { clearClinicalData } from "@/offline/db"
import { clearServiceDrafts } from "@/lib/serviceDrafts"

interface AuthState {
  session: Session | null
  isLoading: boolean
  hasRole: (role: Role) => boolean
  signIn: (returnTo?: string, mode?: AuthMode) => Promise<void>
  signInDemo: (role: Role) => Session
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function homeFor(session: Session | null): string {
  if (!session) return "/"
  if (session.groups.includes("Doctor")) return "/doctor"
  if (session.groups.includes("Operator")) return "/operator"
  if (session.groups.includes("Admin")) return "/admin"
  return session.groups.includes("Patient") ? "/app" : "/staff/sign-in?denied=1"
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    let active = true
    currentSession().then((s) => {
      if (!active) return
      setSession(s)
      setIsLoading(false)
    })
    const cleanups = (["patient", "staff"] as const).map((mode) => {
      const um = getUserManager(mode)
      if (!um) return () => {}
      const onLoaded = (
        user: Parameters<Parameters<typeof um.events.addUserLoaded>[0]>[0]
      ) => {
        if (getAuthMode() === mode) setSession(sessionFromUser(user, mode))
      }
      const onUnloaded = () => {
        if (getAuthMode() === mode) setSession(null)
      }
      um.events.addUserLoaded(onLoaded)
      um.events.addUserUnloaded(onUnloaded)
      um.events.addAccessTokenExpired(onUnloaded)
      return () => {
        um.events.removeUserLoaded(onLoaded)
        um.events.removeUserUnloaded(onUnloaded)
        um.events.removeAccessTokenExpired(onUnloaded)
      }
    })
    return () => {
      active = false
      cleanups.forEach((clean) => clean())
    }
  }, [])

  const signIn = useCallback(
    async (returnTo?: string, mode: AuthMode = "patient") => {
      const um = getUserManager(mode)
      if (um) {
        selectAuthMode(mode)
        clearDemoSession()
        queryClient.clear()
        setSession(null)
        await um.signinRedirect({
          state: { returnTo: returnTo ?? window.location.pathname },
        })
      } else {
        const target = returnTo
          ? `?returnTo=${encodeURIComponent(returnTo)}`
          : ""
        window.location.assign(
          `${mode === "staff" ? "/staff/sign-in" : "/sign-in"}${target}`
        )
      }
    },
    [queryClient]
  )

  const signInDemo = useCallback(
    (role: Role) => {
      queryClient.clear()
      const next = writeDemoSession(role)
      setSession(next)
      return next
    },
    [queryClient]
  )

  const signOut = useCallback(async () => {
    await clearClinicalData()
    clearServiceDrafts()
    queryClient.clear()
    const um = getUserManager()
    if (um) {
      await um.removeUser()
      setSession(null)
      await um.signoutRedirect().catch(() => window.location.assign("/"))
      return
    }
    clearDemoSession()
    window.location.assign("/")
  }, [queryClient])

  const value = useMemo<AuthState>(
    () => ({
      session,
      isLoading,
      hasRole: (role) => Boolean(session?.groups.includes(role)),
      signIn,
      signInDemo,
      signOut,
    }),
    [session, isLoading, signIn, signInDemo, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
