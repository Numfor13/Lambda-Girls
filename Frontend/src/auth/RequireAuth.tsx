import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "./AuthProvider"
import type { Role } from "./session"
import { PageSpinner } from "@/design/components/Spinner"

export function RequireAuth({ role }: { role?: Role }) {
  const { session, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <PageSpinner />
  if (!session) {
    const returnTo = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/sign-in?returnTo=${returnTo}`} replace />
  }
  if (role && !session.groups.includes(role)) {
    return <Navigate to="/sign-in?denied=1" replace />
  }
  return <Outlet />
}
