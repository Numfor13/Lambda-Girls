import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { registerSW } from "virtual:pwa-register"
import "./index.css"
import App from "./App"
import { AuthProvider } from "@/auth/AuthProvider"
import { SyncManager } from "@/app/SyncManager"
import { ApiError } from "@/api/errors"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      networkMode: "offlineFirst",
      retry: (count, error) =>
        !(error instanceof ApiError && [401, 403, 404].includes(error.status)) && count < 2,
    },
    mutations: { networkMode: "always" },
  },
})

registerSW({ immediate: true })

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SyncManager />
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
