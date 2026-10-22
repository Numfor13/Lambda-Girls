const e = import.meta.env

const base = (e.VITE_API_BASE_URL ?? "").replace(/\/$/, "")
const pick = (v: string | undefined) => (v ?? "").replace(/\/$/, "") || base

// Each backend stack has its own API Gateway; one base URL covers them all
// until per-service URLs are set.
export const apiUrls = {
  profile: pick(e.VITE_API_URL_PROFILE),
  facility: pick(e.VITE_API_URL_FACILITY),
  triage: pick(e.VITE_API_URL_TRIAGE),
  consultation: pick(e.VITE_API_URL_CONSULTATION),
  payment: pick(e.VITE_API_URL_PAYMENT),
  doctor: pick(e.VITE_API_URL_DOCTOR),
  push: pick(e.VITE_API_URL_PUSH),
  doctorApplication: pick(e.VITE_API_URL_DOCTOR_APPLICATION),
} as const

export type ApiService = keyof typeof apiUrls

export const env = {
  useMockApi: !Object.values(apiUrls).some(Boolean),
  cognito: {
    authority: e.VITE_COGNITO_AUTHORITY ?? "",
    domain: (e.VITE_COGNITO_DOMAIN ?? "").replace(/\/$/, ""),
    clientId: e.VITE_COGNITO_CLIENT_ID ?? "",
    redirectUri:
      e.VITE_COGNITO_REDIRECT_URI ?? `${window.location.origin}/auth/callback`,
  },
  consultationFeeXaf: Number(e.VITE_CONSULTATION_FEE_XAF ?? 2500),
  consultationFees: {
    general: 2500,
    specialist: 5000,
    lab: 2000,
  },
  osmTileUrl: e.VITE_OSM_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  operatorPhone: "673107072",
  rideBaseRateXafPerKm: 200,
}

export const authConfigured = Boolean(env.cognito.authority && env.cognito.clientId)
