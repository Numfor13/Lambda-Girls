import { ulid } from "ulid"
import seed from "@/data/facilities.seed.json"
import { evaluate } from "@/triage-engine/engine"
import { ApiError } from "./errors"
import type {
  Consultation,
  Facility,
  HealthTip,
  Message,
  Payment,
  Prescription,
  Profile,
  Referral,
  SymptomPayload,
  TriageResult,
  Urgency,
} from "./types"

// In-browser stand-in for the Health Track API, used until the real API URLs are configured.
// Response shapes mirror the Lambda handlers exactly so switching over needs no UI changes.

interface MockDb {
  profiles: Record<string, Profile>
  triage: (TriageResult & { user_id: string })[]
  consultations: Consultation[]
  messages: Message[]
  payments: Payment[]
  prescriptions: Prescription[]
  referrals: Referral[]
  push_subscriptions: Record<string, unknown>
}

const KEY = "cb_mock_db"
const facilities = seed as Facility[]

function load(): MockDb {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as MockDb
  } catch {
    /* fall through to a fresh store */
  }
  return {
    profiles: {},
    triage: [],
    consultations: [],
    messages: [],
    payments: [],
    prescriptions: [],
    referrals: [],
    push_subscriptions: {},
  }
}

function save(data: MockDb) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

// Demo-only content for mock mode. Real data comes from the extended API.
const MOCK_DOCTORS = [
  { doctor_id: "demo-doctor-1", specialty: "General practice", typical_response_minutes: 15 },
  { doctor_id: "demo-doctor-2", specialty: "Paediatrics", typical_response_minutes: 25 },
]
const MOCK_TIPS: HealthTip[] = [
  {
    tip_id: "tip-ors",
    title: "Oral rehydration at home: how to mix ORS safely",
    body: "Mix one sachet in one litre of clean water. Give small sips often, and keep breastfeeding.",
    source_name: "WHO",
    source_url: null,
    published_date: "2026-10-12",
    locale: "en",
    tags: ["children", "diarrhoea"],
    is_active: true,
  },
  {
    tip_id: "tip-malaria",
    title: "Sleep under a treated net every night",
    body: "Mosquitoes that spread malaria bite at night. Tuck the net under the mattress.",
    source_name: "WHO",
    source_url: null,
    published_date: "2026-09-30",
    locale: "en",
    tags: ["malaria"],
    is_active: true,
  },
]

const RANK: Record<Urgency, number> = { RED: 0, AMBER: 1, GREEN: 2 }
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

function code8() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => BASE62[b % 62]).join("")
}

type Handler = (ctx: {
  params: string[]
  body: Record<string, unknown>
  query: URLSearchParams
  user: { sub: string; isDoctor: boolean } | null
  data: MockDb
}) => unknown

function requireUser(user: { sub: string; isDoctor: boolean } | null) {
  if (!user) throw new ApiError(401, "Unauthorized")
  return user
}

function requireDoctor(user: { sub: string; isDoctor: boolean } | null) {
  const u = requireUser(user)
  if (!u.isDoctor) throw new ApiError(403, "Doctor group required")
  return u
}

function findConsultation(data: MockDb, id: string) {
  const c = data.consultations.find((x) => x.consultation_id === id)
  if (!c) throw new ApiError(404, "Consultation not found")
  return c
}

function profileFor(data: MockDb, sub: string): Profile {
  data.profiles[sub] ??= {
    user_id: sub,
    display_name: sub.includes("doctor") ? "Dr. Ambe T." : "Ngozi",
    phone: "+237677000000",
    locale: "en",
    on_behalf_profiles: [],
  }
  return data.profiles[sub]
}

const routes: [string, RegExp, Handler][] = [
  ["GET", /^\/profile$/, ({ user, data }) => profileFor(data, requireUser(user).sub)],
  [
    "PUT",
    /^\/profile$/,
    ({ user, data, body }) => {
      const p = profileFor(data, requireUser(user).sub)
      const updated: string[] = []
      if (typeof body.display_name === "string") {
        p.display_name = body.display_name.slice(0, 100)
        updated.push("display_name")
      }
      if (body.locale === "en" || body.locale === "fr" || body.locale === "pid") {
        p.locale = body.locale
        updated.push("locale")
      }
      return { updated }
    },
  ],
  [
    "POST",
    /^\/profile\/household$/,
    ({ user, data, body }) => {
      const p = profileFor(data, requireUser(user).sub)
      for (const f of ["name", "dob", "sex", "relationship"]) {
        if (!body[f]) throw new ApiError(400, `Missing required field: ${f}`)
      }
      const member = {
        member_id: ulid(),
        name: String(body.name).slice(0, 100),
        dob: String(body.dob),
        sex: body.sex as "male" | "female" | "other",
        relationship: String(body.relationship).slice(0, 50),
      }
      p.on_behalf_profiles = [...(p.on_behalf_profiles ?? []), member]
      return member
    },
  ],
  [
    "DELETE",
    /^\/profile\/household\/([^/]+)$/,
    ({ user, data, params }) => {
      const p = profileFor(data, requireUser(user).sub)
      p.on_behalf_profiles = (p.on_behalf_profiles ?? []).filter((m) => m.member_id !== params[0])
      return { deleted: params[0] }
    },
  ],
  ["GET", /^\/facilities$/, () => ({ facilities, next_key: null })],
  [
    "GET",
    /^\/facilities\/([^/]+)$/,
    ({ params }) => {
      const f = facilities.find((x) => x.facility_id === params[0])
      if (!f) throw new ApiError(404, "Facility not found")
      return f
    },
  ],
  [
    "POST",
    /^\/triage$/,
    ({ user, data, body }) => {
      const sub = requireUser(user).sub
      const payload = {
        age_months: (body.age_months as number) ?? 999,
        is_pregnant: Boolean(body.is_pregnant),
        symptoms: (body.symptoms as string[]) ?? [],
        vitals: (body.vitals as { resp_rate?: number }) ?? {},
      }
      const result = evaluate(payload)
      const item = {
        result_id: crypto.randomUUID(),
        user_id: sub,
        ...result,
        symptom_payload: payload,
        on_behalf_member_id: (body.on_behalf_member_id as string) ?? null,
        synced_from_offline: Boolean(body.queued_at),
        created_at: (body.queued_at as number) ?? Date.now(),
      }
      data.triage.push(item)
      return item
    },
  ],
  [
    "GET",
    /^\/doctors\/available$/,
    ({ user }) => {
      requireUser(user)
      // Demo presence: two doctors heart-beating "now". The real list comes from PUT /doctor/presence.
      const now = Date.now()
      const doctors = MOCK_DOCTORS.map((d) => ({ ...d, last_seen: now - 60_000, is_online: true }))
      return { doctors, count: doctors.length }
    },
  ],
  [
    "GET",
    /^\/health-tips$/,
    ({ query }) => {
      const locale = query.get("locale")
      const tips = MOCK_TIPS.filter((t) => !locale || t.locale === locale)
      return { tips, count: tips.length }
    },
  ],
  ["GET", /^\/push\/vapid-public-key$/, () => ({ vapid_public_key: "MOCK_VAPID_PUBLIC_KEY_BASE64" })],
  [
    "POST",
    /^\/push\/subscribe$/,
    ({ user, data, body }) => {
      const sub = requireUser(user).sub
      data.push_subscriptions ??= {}
      data.push_subscriptions[sub] = { endpoint: body.endpoint, keys: body.keys }
      return { subscribed: true }
    },
  ],
  [
    "DELETE",
    /^\/push\/subscribe$/,
    ({ user, data }) => {
      const sub = requireUser(user).sub
      if (data.push_subscriptions) delete data.push_subscriptions[sub]
      return { unsubscribed: true }
    },
  ],
  [
    "GET",
    /^\/triage$/,
    ({ user, data }) => {
      const sub = requireUser(user).sub
      const results = data.triage
        .filter((t) => t.user_id === sub)
        .sort((a, b) => b.created_at - a.created_at)
      return { results, count: results.length }
    },
  ],
  [
    "GET",
    /^\/triage\/([^/]+)$/,
    ({ user, data, params }) => {
      requireUser(user)
      const t = data.triage.find((x) => x.result_id === params[0])
      if (!t) throw new ApiError(404, "Triage result not found")
      return t
    },
  ],
  [
    "GET",
    /^\/consultations$/,
    ({ user, data }) => {
      const u = requireUser(user)
      const consultations = u.isDoctor
        ? data.consultations.filter((c) => c.status === "paid" || c.status === "open")
        : data.consultations
            .filter((c) => c.phone_owner_id === u.sub)
            .sort((a, b) => b.created_at - a.created_at)
      return { consultations, count: consultations.length }
    },
  ],
  [
    "POST",
    /^\/consultations$/,
    ({ user, data, body }) => {
      const sub = requireUser(user).sub
      const complaint = String(body.complaint ?? "").trim()
      if (!complaint) throw new ApiError(400, "complaint is required")
      const now = Date.now()
      const item: Consultation = {
        consultation_id: crypto.randomUUID(),
        patient_id: (body.patient_id as string) || sub,
        phone_owner_id: sub,
        on_behalf_member_id: (body.on_behalf_member_id as string) ?? null,
        triage_result_id: (body.triage_result_id as string) ?? null,
        complaint,
        status: "pending_payment",
        urgency: (body.urgency as Urgency) ?? null,
        doctor_id: null,
        created_at: now,
        updated_at: now,
      }
      data.consultations.push(item)
      return item
    },
  ],
  [
    "GET",
    /^\/consultations\/([^/]+)$/,
    ({ user, data, params }) => {
      requireUser(user)
      const consultation = findConsultation(data, params[0])
      const messages = data.messages
        .filter((m) => m.consultation_id === params[0])
        .sort((a, b) => a.created_at - b.created_at)
      return { consultation, messages }
    },
  ],
  [
    "POST",
    /^\/consultations\/([^/]+)\/messages$/,
    ({ user, data, params, body }) => {
      const u = requireUser(user)
      const clientId = String(body.client_message_id ?? crypto.randomUUID())
      const existing = data.messages.find((m) => m.client_message_id === clientId)
      if (existing) return existing
      findConsultation(data, params[0])
      const message: Message = {
        consultation_id: params[0],
        message_id: crypto.randomUUID(),
        sender_id: u.sub,
        sender_role: u.isDoctor ? "doctor" : "patient",
        content_type: body.content_type === "voice_note" ? "voice_note" : "text",
        text_body: (body.text_body as string) ?? null,
        voice_note_key: (body.voice_note_key as string) ?? null,
        duration_seconds: (body.duration_seconds as number) ?? null,
        client_message_id: clientId,
        created_at: Date.now(),
      }
      if (message.content_type === "text" && !message.text_body?.trim()) {
        throw new ApiError(400, "text_body is required for text messages")
      }
      data.messages.push(message)
      return message
    },
  ],
  [
    "POST",
    /^\/consultations\/([^/]+)\/voice-note-upload-url$/,
    ({ user, data, params }) => {
      requireUser(user)
      findConsultation(data, params[0])
      const key = `voice-notes/${params[0]}/${crypto.randomUUID()}.opus`
      return { upload_url: `mock://${key}`, voice_note_key: key }
    },
  ],
  [
    "GET",
    /^\/consultations\/([^/]+)\/voice-note\/([^/]+)$/,
    ({ user, data, params }) => {
      requireUser(user)
      const m = data.messages.find((x) => x.message_id === params[1])
      if (!m?.voice_note_key) throw new ApiError(404, "Voice note not found")
      return { download_url: `mock://${m.voice_note_key}`, expires_in: 300 }
    },
  ],
  [
    "POST",
    /^\/sync$/,
    ({ user, data, body }) => {
      const sub = requireUser(user).sub
      const results = {
        triage_results: [] as { result_id: string; status: "ok" }[],
        messages: [] as { message_id: string; status: "ok" | "duplicate" }[],
      }
      let hasRed = false
      for (const tr of (body.triage_results as {
        result_id: string
        symptom_payload?: SymptomPayload
        on_behalf_member_id?: string | null
        queued_at?: number
      }[]) ?? []) {
        const payload: SymptomPayload = tr.symptom_payload ?? {
          age_months: 999,
          is_pregnant: false,
          symptoms: [],
          vitals: {},
        }
        const result = evaluate(payload)
        data.triage = data.triage.filter((t) => t.result_id !== tr.result_id)
        data.triage.push({
          result_id: tr.result_id ?? crypto.randomUUID(),
          user_id: sub,
          ...result,
          symptom_payload: payload,
          on_behalf_member_id: tr.on_behalf_member_id ?? null,
          synced_from_offline: true,
          created_at: tr.queued_at ?? Date.now(),
        })
        if (result.urgency === "RED") hasRed = true
        results.triage_results.push({ result_id: tr.result_id, status: "ok" })
      }
      for (const msg of (body.messages as Message[]) ?? []) {
        if (data.messages.some((m) => m.client_message_id === msg.client_message_id)) {
          results.messages.push({ message_id: msg.message_id, status: "duplicate" })
          continue
        }
        data.messages.push({ ...msg, sender_id: sub })
        results.messages.push({ message_id: msg.message_id, status: "ok" })
      }
      return { synced: true, has_red_triage: hasRed, results }
    },
  ],
  [
    "POST",
    /^\/payments\/initiate$/,
    ({ user, data, body }) => {
      const sub = requireUser(user).sub
      const c = findConsultation(data, String(body.consultation_id))
      const payment: Payment = {
        payment_id: crypto.randomUUID(),
        consultation_id: c.consultation_id,
        payer_id: sub,
        patient_id: c.patient_id,
        amount_xaf: 2000,
        fapshi_ref: `MOCK-${code8()}`,
        status: "initiated",
        receipt_data: { payer_phone: String(body.phone ?? "") },
        created_at: Date.now(),
        confirmed_at: null,
      }
      data.payments.push(payment)
      return {
        payment_id: payment.payment_id,
        payment_url: String(body.redirect_url),
        fapshi_ref: payment.fapshi_ref,
      }
    },
  ],
  [
    "GET",
    /^\/payments$/,
    ({ user, data }) => {
      const sub = requireUser(user).sub
      const payments = data.payments.filter((p) => p.payer_id === sub)
      return { payments, count: payments.length }
    },
  ],
  [
    "GET",
    /^\/payments\/([^/]+)$/,
    ({ user, data, params }) => {
      requireUser(user)
      const p = data.payments.find((x) => x.payment_id === params[0])
      if (!p) throw new ApiError(404, "Payment not found")
      // Simulates the Fapshi webhook arriving a few seconds after checkout.
      if (p.status === "initiated" && Date.now() - p.created_at > 3000) {
        p.status = "confirmed"
        p.confirmed_at = Date.now()
        p.receipt_data = {
          ...p.receipt_data,
          reference: p.fapshi_ref,
          amount: p.amount_xaf,
          timestamp: p.confirmed_at,
        }
        const c = findConsultation(data, p.consultation_id)
        if (c.status === "pending_payment") {
          c.status = "paid"
          c.updated_at = Date.now()
        }
      }
      return p
    },
  ],
  [
    "GET",
    /^\/doctor\/queue$/,
    ({ user, data }) => {
      requireDoctor(user)
      const queue = data.consultations
        .filter((c) => c.status === "paid" || c.status === "open")
        .sort(
          (a, b) =>
            RANK[a.urgency ?? "GREEN"] - RANK[b.urgency ?? "GREEN"] || a.created_at - b.created_at,
        )
      return { queue, count: queue.length }
    },
  ],
  [
    "GET",
    /^\/doctor\/queue\/([^/]+)$/,
    ({ user, data, params }) => {
      requireDoctor(user)
      const consultation = findConsultation(data, params[0])
      const messages = data.messages
        .filter((m) => m.consultation_id === params[0])
        .sort((a, b) => a.created_at - b.created_at)
      const triage_result =
        data.triage.find((t) => t.result_id === consultation.triage_result_id) ?? null
      return { consultation, messages, triage_result }
    },
  ],
  [
    "PUT",
    /^\/doctor\/queue\/([^/]+)\/claim$/,
    ({ user, data, params }) => {
      const u = requireDoctor(user)
      const c = findConsultation(data, params[0])
      if (c.status !== "paid") throw new ApiError(409, "Consultation is not claimable")
      c.status = "open"
      c.doctor_id = u.sub
      c.updated_at = Date.now()
      return { consultation_id: c.consultation_id, doctor_id: u.sub, status: "open" }
    },
  ],
  [
    "PUT",
    /^\/consultations\/([^/]+)\/close$/,
    ({ user, data, params }) => {
      requireDoctor(user)
      const c = findConsultation(data, params[0])
      c.status = "closed"
      c.updated_at = Date.now()
      return { consultation_id: c.consultation_id, status: "closed" }
    },
  ],
  [
    "POST",
    /^\/consultations\/([^/]+)\/prescription$/,
    ({ user, data, params, body }) => {
      const u = requireDoctor(user)
      const c = findConsultation(data, params[0])
      const medication = String(body.medication_details ?? "").trim()
      if (!medication) throw new ApiError(400, "medication_details is required")
      const code = code8()
      data.prescriptions.push({
        code,
        consultation_id: c.consultation_id,
        doctor_id: u.sub,
        patient_id: c.patient_id,
        medication_details: medication,
        instructions: String(body.instructions ?? ""),
        issued_at: Date.now(),
        status: "active",
      })
      return { code, consultation_id: c.consultation_id }
    },
  ],
  [
    "POST",
    /^\/consultations\/([^/]+)\/referral$/,
    ({ user, data, params, body }) => {
      const u = requireDoctor(user)
      const c = findConsultation(data, params[0])
      const target = String(body.target_facility_id ?? "").trim()
      if (!target) throw new ApiError(400, "target_facility_id is required")
      const code = code8()
      data.referrals.push({
        code,
        consultation_id: c.consultation_id,
        doctor_id: u.sub,
        patient_id: c.patient_id,
        target_facility_id: target,
        reason: String(body.reason ?? ""),
        issued_at: Date.now(),
        status: "active",
      })
      return { code, consultation_id: c.consultation_id }
    },
  ],
  [
    "GET",
    /^\/prescriptions\/([^/]+)$/,
    ({ data, params }) => {
      const p = data.prescriptions.find((x) => x.code === params[0])
      if (!p) throw new ApiError(404, "Prescription not found")
      return p
    },
  ],
  [
    "GET",
    /^\/referrals\/([^/]+)$/,
    ({ data, params }) => {
      const r = data.referrals.find((x) => x.code === params[0])
      if (!r) throw new ApiError(404, "Referral not found")
      return r
    },
  ],
]

export async function mockRequest<T>(
  method: string,
  fullPath: string,
  body: unknown,
  token: string | null,
): Promise<T> {
  await new Promise((r) => setTimeout(r, 250))
  if (!navigator.onLine) throw new ApiError(0, "Network unavailable")

  const [path, qs = ""] = fullPath.split("?")
  const route = routes.find(([m, re]) => m === method && re.test(path))
  if (!route) throw new ApiError(404, `No mock route for ${method} ${path}`)

  const [sub, groups = ""] = token ? token.split("|") : []
  const data = load()
  const result = route[2]({
    params: path.match(route[1])!.slice(1),
    body: (body ?? {}) as Record<string, unknown>,
    query: new URLSearchParams(qs),
    user: sub ? { sub, isDoctor: groups.split(",").includes("Doctor") } : null,
    data,
  })
  save(data)
  return structuredClone(result) as T
}
