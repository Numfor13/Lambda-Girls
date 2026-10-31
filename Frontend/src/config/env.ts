const e = import.meta.env
const origin =
  typeof window === "undefined"
    ? "http://localhost:5173"
    : window.location.origin

const base = (e.VITE_API_BASE_URL ?? "").replace(/\/$/, "")
const pick = (v: string | undefined) => (v ?? "").replace(/\/$/, "") || base

// The unified API covers all services; per-service URLs remain optional overrides.
export const apiUrls = {
  profile: pick(e.VITE_API_URL_PROFILE),
  facility: pick(e.VITE_API_URL_FACILITY),
  triage: pick(e.VITE_API_URL_TRIAGE),
  consultation: pick(e.VITE_API_URL_CONSULTATION),
  payment: pick(e.VITE_API_URL_PAYMENT),
  doctor: pick(e.VITE_API_URL_DOCTOR),
  push: pick(e.VITE_API_URL_PUSH),
  extended: pick(e.VITE_API_URL_EXTENDED),
  channel: pick(e.VITE_API_URL_CHANNEL),
  anonymous: pick(e.VITE_API_URL_ANONYMOUS),
  i18n: pick(e.VITE_API_URL_I18N),
  // Doctor application routes share the main API unless explicitly overridden.
  doctorApplication: pick(e.VITE_API_URL_DOCTOR_APPLICATION),
} as const

export type ApiService = keyof typeof apiUrls

export const env = {
  useMockApi: !Object.values(apiUrls).some(Boolean),
  cognito: {
    authority: e.VITE_COGNITO_AUTHORITY ?? "",
    domain: (e.VITE_COGNITO_DOMAIN ?? "").replace(/\/$/, ""),
    clientId: e.VITE_COGNITO_CLIENT_ID ?? "",
    redirectUri: e.VITE_COGNITO_REDIRECT_URI ?? `${origin}/auth/callback`,
  },
  cognitoStaff: {
    authority: e.VITE_COGNITO_STAFF_AUTHORITY ?? "",
    domain: (e.VITE_COGNITO_STAFF_DOMAIN ?? "").replace(/\/$/, ""),
    clientId: e.VITE_COGNITO_STAFF_CLIENT_ID ?? "",
    redirectUri: e.VITE_COGNITO_STAFF_REDIRECT_URI ?? `${origin}/auth/callback`,
  },
  consultationFeeXaf: Number(e.VITE_CONSULTATION_FEE_XAF ?? 2000),
  osmTileUrl:
    e.VITE_OSM_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  googleMapsEmbedKey: e.VITE_GOOGLE_MAPS_EMBED_API_KEY ?? "",
  // Used only by the unrouted rides, call and doctor-profile screens; the backend
  // charges one server-side fee (consultationFeeXaf).
  consultationFees: {
    general: 2500,
    specialist: 5000,
    lab: 2000,
  },
  operatorPhone: "673107072",
  rideBaseRateXafPerKm: 200,
}

export const authConfigured = Boolean(
  env.cognito.authority && env.cognito.clientId
)

export const staffAuthConfigured = Boolean(
  env.cognitoStaff.authority && env.cognitoStaff.clientId
)
