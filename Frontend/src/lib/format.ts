import type { Capability } from "@/api/types"

const xaf = new Intl.NumberFormat("en-CM", { maximumFractionDigits: 0 })

export function formatXaf(amount: number): string {
  return `${xaf.format(amount)} XAF`
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

export function formatDate(ms: number | string): string {
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function formatDateTime(ms: number): string {
  return `${formatDate(ms)}, ${formatTime(ms)}`
}

export function timeAgo(ms: number, now: number): string {
  const mins = Math.max(0, Math.round((now - ms) / 60_000))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return formatDate(ms)
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export function ageInMonths(dob: string, now: number): number {
  const d = new Date(dob)
  const n = new Date(now)
  let months = (n.getFullYear() - d.getFullYear()) * 12 + (n.getMonth() - d.getMonth())
  if (n.getDate() < d.getDate()) months -= 1
  return Math.max(0, months)
}

export function describeAge(months: number): string {
  if (months < 24) return `${months} month${months === 1 ? "" : "s"}`
  return `${Math.floor(months / 12)} years`
}

export const CAPABILITY_LABELS: Record<Capability, string> = {
  general: "General care",
  maternity: "Maternity",
  emergency: "Emergency",
  laboratory: "Laboratory",
  pharmacy: "Pharmacy",
  blood_bank: "Blood bank",
  x_ray: "X-ray",
  dental: "Dental",
  eye_clinic: "Eye clinic",
}

export function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("")
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`
}

export function formatPhone(phone: string): string {
  const m = phone.match(/^\+237(\d{3})(\d{3})(\d{3})$/)
  return m ? `+237 ${m[1]} ${m[2]} ${m[3]}` : phone
}
