/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_URL_PROFILE?: string
  readonly VITE_API_URL_FACILITY?: string
  readonly VITE_API_URL_TRIAGE?: string
  readonly VITE_API_URL_CONSULTATION?: string
  readonly VITE_API_URL_PAYMENT?: string
  readonly VITE_API_URL_DOCTOR?: string
  readonly VITE_API_URL_PUSH?: string
  readonly VITE_COGNITO_AUTHORITY?: string
  readonly VITE_COGNITO_DOMAIN?: string
  readonly VITE_COGNITO_CLIENT_ID?: string
  readonly VITE_COGNITO_REDIRECT_URI?: string
  readonly VITE_CONSULTATION_FEE_XAF?: string
  readonly VITE_OSM_TILE_URL?: string
  readonly [key: `VITE_FLAG_${string}`]: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
