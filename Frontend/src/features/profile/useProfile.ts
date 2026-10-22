import { useQuery } from "@tanstack/react-query"
import { profileApi } from "@/api/endpoints"
import { ApiError } from "@/api/errors"
import type { Profile } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { getMeta, setMeta } from "@/offline/db"

export function useProfile() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ["profile", session?.sub],
    enabled: Boolean(session),
    queryFn: async (): Promise<Profile> => {
      try {
        const profile = await profileApi.get()
        await setMeta("profile", profile)
        return profile
      } catch (e) {
        if (e instanceof ApiError && e.isOffline) {
          const cached = await getMeta<Profile>("profile")
          if (cached) return cached
        }
        throw e
      }
    },
  })
}
