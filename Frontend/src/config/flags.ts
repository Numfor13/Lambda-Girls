const FLAG_NAMES = [
  "map_view",
  "push",
  "consult_history",
  "doctors_available",
  "prescriptions",
  "referrals",
  "appointments",
  "lab_tests",
  "blood",
  "emergency",
  "health_tips",
  "pay_for_other",
  "receipts",
  "anonymous",
  "operator_console",
  "sms_ussd_sim",
  "i18n_fr",
  "i18n_pid",
] as const

export type Flag = (typeof FLAG_NAMES)[number]

// Tier 2 features whose UI is finished ship on; the rest stay hidden until built.
const DEFAULTS: Record<Flag, boolean> = {
  map_view: false,
  push: false,
  consult_history: false,
  doctors_available: true,
  prescriptions: true,
  referrals: true,
  appointments: false,
  lab_tests: false,
  blood: false,
  emergency: false,
  health_tips: true,
  pay_for_other: true,
  receipts: false,
  anonymous: false,
  operator_console: false,
  sms_ussd_sim: false,
  i18n_fr: false,
  i18n_pid: false,
}

function read(flag: Flag): boolean {
  const raw = import.meta.env[`VITE_FLAG_${flag.toUpperCase()}`]
  if (raw === undefined) return DEFAULTS[flag]
  return raw === "true" || raw === "1"
}

export const flags = Object.fromEntries(FLAG_NAMES.map((f) => [f, read(f)])) as Record<
  Flag,
  boolean
>
