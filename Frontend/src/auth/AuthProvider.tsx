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
  signIn: (returnTo?: string) => Promise<void>
  signInDemo: (role: Role) => Session
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function homeFor(session: Session | null): string {
  if (!session) return "/"
  if (session.groups.includes("Doctor")) return "/doctor"
  if (session.groups.includes("Operator")) return "/operator"
  if (session.groups.includes("Admin")) return "/admin"
  return "/app"
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
    const um = getUserManager()
    if (!um) return () => void (active = false)
    const onLoaded = (
      user: Parameters<Parameters<typeof um.events.addUserLoaded>[0]>[0]
    ) => setSession(sessionFromUser(user))
    const onUnloaded = () => setSession(null)
    um.events.addUserLoaded(onLoaded)
    um.events.addUserUnloaded(onUnloaded)
    return () => {
      active = false
      um.events.removeUserLoaded(onLoaded)
      um.events.removeUserUnloaded(onUnloaded)
    }
  }, [])

  const signIn = useCallback(async (returnTo?: string) => {
    const um = getUserManager()
    if (um) {
      await um.signinRedirect({
        state: { returnTo: returnTo ?? window.location.pathname },
      })
    } else {
      const target = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""
      window.location.assign(`/sign-in${target}`)
    }
  }, [])

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
