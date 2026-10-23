import { ApiError } from "./errors"
import type {
  AvailableDoctor,
  Consultation,
  Facility,
  HealthTip,
  Message,
  Payment,
} from "./types"
import {
  BLOOD_TYPES,
  LAB_STEPS,
  type Appointment,
  type BloodRequest,
  type CallbackRequest,
  type Emergency,
  type LabRequest,
} from "./services"

export interface ServiceMockDb {
  appointments: Appointment[]
  labs: LabRequest[]
  blood: BloodRequest[]
  emergencies: Emergency[]
  callbacks: CallbackRequest[]
  tips: HealthTip[]
  facilities: Facility[]
  presence: AvailableDoctor[]
  sessions: Record<string, number>
}
interface Context {
  params: string[]
  body: Record<string, unknown>
  query: URLSearchParams
  user: { sub: string; isDoctor: boolean } | null
  data: {
    services?: ServiceMockDb
    consultations: Consultation[]
    messages: Message[]
    payments: Payment[]
  }
}
type Route = [string, RegExp, (ctx: Context) => unknown]
const rank = { RED: 0, AMBER: 1, GREEN: 2 }
const uuid = () => crypto.randomUUID()
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const required = (v: unknown, field: string) => {
  const s = text(v)
  if (!s) throw new ApiError(400, `${field} is required`)
  return s
}
function user(ctx: Context, ...roles: string[]) {
  if (!ctx.user) throw new ApiError(401, "Unauthorized")
  // Demo identities are fixed by writeDemoSession; never used by the real API.
  const role = ctx.user.isDoctor
    ? "Doctor"
    : ctx.user.sub === "demo-operator-1"
      ? "Operator"
      : ctx.user.sub === "demo-admin-1"
        ? "Admin"
        : "Patient"
  if (roles.length && !roles.includes(role))
    throw new ApiError(403, `${roles.join(" or ")} group required`)
  return ctx.user.sub
}
function own<T extends { patient_id: string }>(
  ctx: Context,
  item: T | undefined,
  staff = false
): T {
  const sub = user(ctx)
  if (
    !item ||
    (item.patient_id !== sub &&
      !(staff && ["demo-admin-1", "demo-operator-1"].includes(sub)))
  )
    throw new ApiError(404, "Request not found")
  return item
}
export function serviceMockRoutes(
  seed: Facility[],
  tips: HealthTip[]
): Route[] {
  function db(ctx: Context) {
    ctx.data.services ??= {
      appointments: [],
      labs: [],
      blood: [],
      emergencies: [],
      callbacks: [
        {
          request_id: "demo-callback-1",
          phone: "+237677000000",
          urgency: "AMBER",
          status: "pending",
          created_at: Date.now() - 600_000,
        },
      ],
      tips: structuredClone(tips),
      facilities: structuredClone(seed),
      presence: [],
      sessions: {},
    }
    return ctx.data.services
  }
  function anon(ctx: Context) {
    const sub = ctx.user?.sub ?? ""
    if (
      !sub.startsWith("anon:") ||
      (db(ctx).sessions[sub.slice(5)] ?? 0) <= Date.now() / 1000
    )
      throw new ApiError(401, "Anonymous session expired")
    return sub
  }
  const tipBody = (body: Record<string, unknown>) => {
    for (const key of [
      "title",
      "body",
      "source_name",
      "published_date",
      "locale",
    ])
      required(body[key], key)
    if (!["en", "fr", "pid"].includes(String(body.locale)))
      throw new ApiError(400, "Invalid locale")
    return body
  }
  return [
    [
      "GET",
      /^\/health-tips$/,
      (ctx) => {
        const all = db(ctx).tips.filter(
          (t) =>
            t.is_active &&
            (!ctx.query.get("locale") ||
              t.locale === ctx.query.get("locale")) &&
            (!ctx.query.get("tag") || t.tags.includes(ctx.query.get("tag")!))
        )
        const offset = Number(ctx.query.get("next_token") || 0),
          limit = Number(ctx.query.get("limit") || 20)
        if (
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 50 ||
          !Number.isInteger(offset) ||
          offset < 0
        )
          throw new ApiError(400, "Invalid pagination")
        const page = all.slice(offset, offset + limit)
        return {
          tips: page,
          count: page.length,
          ...(offset + limit < all.length
            ? { next_token: String(offset + limit) }
            : {}),
        }
      },
    ],
    [
      "POST",
      /^\/health-tips$/,
      (ctx) => {
        user(ctx, "Admin")
        const item = {
          ...tipBody(ctx.body),
          tip_id: uuid(),
          source_url: ctx.body.source_url ?? null,
          tags: ctx.body.tags ?? [],
          is_active: ctx.body.is_active ?? true,
        } as unknown as HealthTip
        db(ctx).tips.unshift(item)
        return item
      },
    ],
    [
      "PUT",
      /^\/health-tips\/([^/]+)$/,
      (ctx) => {
        user(ctx, "Admin")
        const item = db(ctx).tips.find((t) => t.tip_id === ctx.params[0])
        if (!item) throw new ApiError(404, "Tip not found")
        tipBody({ ...item, ...ctx.body })
        Object.assign(item, ctx.body)
        return item
      },
    ],
    [
      "DELETE",
      /^\/health-tips\/([^/]+)$/,
      (ctx) => {
        user(ctx, "Admin")
        db(ctx).tips = db(ctx).tips.filter((t) => t.tip_id !== ctx.params[0])
        return { deleted: ctx.params[0] }
      },
    ],
    [
      "GET",
      /^\/facilities$/,
      (ctx) => ({
        facilities: db(ctx).facilities.filter(
          (f) =>
            f.is_active &&
            (!ctx.query.get("capability") ||
              f.capabilities.includes(ctx.query.get("capability") as never))
        ),
        next_key: null,
      }),
    ],
    [
      "GET",
      /^\/facilities\/([^/]+)$/,
      (ctx) => {
        const f = db(ctx).facilities.find(
          (f) => f.facility_id === ctx.params[0]
        )
        if (!f || !f.is_active) throw new ApiError(404, "Facility not found")
        return f
      },
    ],
    [
      "POST",
      /^\/facilities$/,
      (ctx) => {
        user(ctx, "Admin")
        for (const f of [
          "name",
          "region",
          "quarter",
          "address",
          "phone",
          "latitude",
          "longitude",
        ])
          if (ctx.body[f] === undefined)
            throw new ApiError(400, `${f} is required`)
        const f = {
          ...ctx.body,
          facility_id: uuid(),
          is_active: true,
        } as unknown as Facility
        db(ctx).facilities.push(f)
        return f
      },
    ],
    [
      "PUT",
      /^\/facilities\/([^/]+)$/,
      (ctx) => {
        user(ctx, "Admin")
        const f = db(ctx).facilities.find(
          (f) => f.facility_id === ctx.params[0]
        )
        if (!f) throw new ApiError(404, "Facility not found")
        Object.assign(f, ctx.body)
        return f
      },
    ],
    [
      "GET",
      /^\/appointments$/,
      (ctx) => {
        const sub = user(ctx),
          status = ctx.query.get("status")
        const appointments = db(ctx).appointments.filter(
          (a) =>
            ((sub === "demo-admin-1" && status) || a.patient_id === sub) &&
            (!status || a.status === status)
        )
        return { appointments, count: appointments.length }
      },
    ],
    [
      "POST",
      /^\/appointments$/,
      (ctx) => {
        const sub = user(ctx),
          b = ctx.body
        required(b.facility_id, "facility_id")
        required(b.slot_date, "slot_date")
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(String(b.slot_date)) ||
          String(b.slot_date) < new Date().toISOString().slice(0, 10)
        )
          throw new ApiError(400, "Choose today or a future date")
        if (!["morning", "afternoon", "evening"].includes(String(b.slot_label)))
          throw new ApiError(400, "Invalid slot")
        const item = {
          appointment_id: uuid(),
          patient_id: sub,
          facility_id: b.facility_id,
          slot_date: b.slot_date,
          slot_label: b.slot_label,
          note: b.note || "",
          status: "requested",
          created_at: Date.now(),
          updated_at: Date.now(),
        } as Appointment
        db(ctx).appointments.unshift(item)
        return item
      },
    ],
    [
      "DELETE",
      /^\/appointments\/([^/]+)$/,
      (ctx) => {
        const a = own(
          ctx,
          db(ctx).appointments.find((a) => a.appointment_id === ctx.params[0]),
          ctx.user?.sub === "demo-admin-1"
        )
        a.status = "cancelled"
        a.updated_at = Date.now()
        return a
      },
    ],
    [
      "PUT",
      /^\/appointments\/([^/]+)\/confirm$/,
      (ctx) => {
        user(ctx, "Admin")
        const a = db(ctx).appointments.find(
          (a) => a.appointment_id === ctx.params[0]
        )
        if (!a) throw new ApiError(404, "Appointment not found")
        if (a.status !== "requested")
          throw new ApiError(409, "Appointment is no longer requested")
        a.status = "confirmed"
        a.updated_at = Date.now()
        return a
      },
    ],
    [
      "GET",
      /^\/lab-requests$/,
      (ctx) => {
        const sub = user(ctx),
          lab_requests = db(ctx).labs.filter((l) => l.patient_id === sub)
        return { lab_requests, count: lab_requests.length }
      },
    ],
    [
      "POST",
      /^\/lab-requests$/,
      (ctx) => {
        const sub = user(ctx)
        const l: LabRequest = {
          request_id: uuid(),
          patient_id: sub,
          test_type: required(ctx.body.test_type, "test_type"),
          facility_id: required(ctx.body.facility_id, "facility_id"),
          collection_address: text(ctx.body.collection_address),
          status: "requested",
          payment_id: null,
          result_summary: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        }
        db(ctx).labs.unshift(l)
        return l
      },
    ],
    [
      "GET",
      /^\/lab-requests\/([^/]+)$/,
      (ctx) =>
        own(
          ctx,
          db(ctx).labs.find((l) => l.request_id === ctx.params[0]),
          true
        ),
    ],
    [
      "PUT",
      /^\/lab-requests\/([^/]+)\/status$/,
      (ctx) => {
        user(ctx, "Admin", "Operator")
        const l = db(ctx).labs.find((l) => l.request_id === ctx.params[0])
        if (!l) throw new ApiError(404, "Lab request not found")
        if (ctx.body.status !== LAB_STEPS[LAB_STEPS.indexOf(l.status) + 1])
          throw new ApiError(409, "Lab status changed; refresh before updating")
        if (
          ctx.body.result_summary !== undefined &&
          ctx.body.status !== "results_ready"
        )
          throw new ApiError(
            400,
            "Result summary is only accepted at results ready"
          )
        if (ctx.body.result_summary != null && typeof ctx.body.result_summary !== "string")
          throw new ApiError(400, "result_summary must be a string")
        Object.assign(l, ctx.body, { updated_at: Date.now() })
        return l
      },
    ],
    [
      "POST",
      /^\/blood-requests$/,
      (ctx) => {
        const sub = user(ctx),
          b = ctx.body
        required(b.requesting_facility_id, "requesting_facility_id")
        if (
          !BLOOD_TYPES.includes(b.blood_type as never) ||
          !Number.isInteger(b.units) ||
          Number(b.units) < 1 ||
          Number(b.units) > 20 ||
          !["RED", "AMBER", "GREEN"].includes(String(b.urgency))
        )
          throw new ApiError(400, "Invalid blood request")
        const r = {
          ...b,
          request_id: uuid(),
          requested_by: sub,
          status: "pending",
          created_at: Date.now(),
          updated_at: Date.now(),
        } as unknown as BloodRequest
        db(ctx).blood.unshift(r)
        return {
          ...r,
          blood_bank_facilities: db(ctx)
            .facilities.filter((f) => f.capabilities[0] === "blood_bank")
            .map(({ facility_id, name, phone }) => ({
              facility_id,
              name,
              phone,
            })),
        }
      },
    ],
    [
      "GET",
      /^\/blood-requests$/,
      (ctx) => {
        user(ctx, "Operator")
        const blood_requests = [...db(ctx).blood].sort(
          (a, b) =>
            rank[a.urgency] - rank[b.urgency] || a.created_at - b.created_at
        )
        return { blood_requests, count: blood_requests.length }
      },
    ],
    [
      "POST",
      /^\/emergency$/,
      (ctx) => {
        const sub = user(ctx)
        if (
          !Number.isFinite(ctx.body.latitude) ||
          !Number.isFinite(ctx.body.longitude) ||
          Math.abs(Number(ctx.body.latitude)) > 90 ||
          Math.abs(Number(ctx.body.longitude)) > 180
        )
          throw new ApiError(400, "Invalid coordinates")
        const e = {
          emergency_id: uuid(),
          user_id: sub,
          latitude: Number(ctx.body.latitude),
          longitude: Number(ctx.body.longitude),
          triage_result_id: text(ctx.body.triage_result_id) || null,
          timestamp: Date.now(),
          ttl: Math.floor(Date.now() / 1000) + 86400,
          alert_sent: true,
        }
        db(ctx).emergencies.unshift(e)
        return e
      },
    ],
    [
      "GET",
      /^\/operator\/emergencies$/,
      (ctx) => {
        user(ctx, "Operator")
        const emergencies = db(ctx).emergencies.filter(
          (e) => e.ttl > Date.now() / 1000
        )
        return { emergencies, count: emergencies.length }
      },
    ],
    [
      "GET",
      /^\/operator\/callbacks$/,
      (ctx) => {
        user(ctx, "Operator")
        const callbacks = db(ctx).callbacks.filter(
          (c) => c.status === "pending"
        )
        return { callbacks, count: callbacks.length }
      },
    ],
    [
      "PUT",
      /^\/operator\/callbacks\/([^/]+)\/handle$/,
      (ctx) => {
        user(ctx, "Operator")
        const c = db(ctx).callbacks.find((c) => c.request_id === ctx.params[0])
        if (!c || c.status !== "pending")
          throw new ApiError(409, "Callback not found or already handled")
        c.status = "handled"
        return { request_id: c.request_id, status: "handled" }
      },
    ],
    [
      "POST",
      /^\/operator\/dispatch-log$/,
      (ctx) => {
        user(ctx, "Operator")
        required(ctx.body.facility_id, "facility_id")
        return { log_id: uuid() }
      },
    ],
    [
      "PUT",
      /^\/doctor\/presence$/,
      (ctx) => {
        const sub = user(ctx, "Doctor"),
          s = db(ctx)
        const d = s.presence.find((d) => d.doctor_id === sub) ?? {
          doctor_id: sub,
          specialty: "General practice",
          typical_response_minutes: 30,
          last_seen: 0,
          is_online: true,
        }
        d.last_seen = Date.now()
        if (!s.presence.includes(d)) s.presence.push(d)
        return d
      },
    ],
    [
      "GET",
      /^\/doctors\/available$/,
      (ctx) => {
        user(ctx)
        const doctors = db(ctx).presence.filter(
          (d) => Date.now() - d.last_seen < 300_000
        )
        return { doctors, count: doctors.length }
      },
    ],
    [
      "POST",
      /^\/anonymous\/session$/,
      (ctx) => {
        const session_token = uuid(),
          expires_at = Math.floor(Date.now() / 1000) + 604800
        db(ctx).sessions[session_token] = expires_at
        return { session_token, expires_at }
      },
    ],
    [
      "GET",
      /^\/anonymous\/consultations$/,
      (ctx) => {
        const sub = anon(ctx),
          consultations = ctx.data.consultations.filter(
            (c) => c.patient_id === sub
          )
        return { consultations, count: consultations.length }
      },
    ],
    [
      "POST",
      /^\/anonymous\/consultations$/,
      (ctx) => {
        const sub = anon(ctx),
          complaint = required(ctx.body.complaint, "complaint")
        if (complaint.length > 2000)
          throw new ApiError(400, "Complaint must be at most 2000 characters")
        const c: Consultation = {
          consultation_id: uuid(),
          patient_id: sub,
          phone_owner_id: sub,
          on_behalf_member_id: null,
          triage_result_id: null,
          complaint,
          status: "pending_payment",
          urgency: null,
          doctor_id: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        }
        ctx.data.consultations.unshift(c)
        return c
      },
    ],
    [
      "GET",
      /^\/anonymous\/consultations\/([^/]+)$/,
      (ctx) => {
        const sub = anon(ctx)
        const c = ctx.data.consultations.find(
          (c) => c.consultation_id === ctx.params[0] && c.patient_id === sub
        )
        if (!c) throw new ApiError(404, "Consultation not found")
        for (const p of ctx.data.payments.filter(
          (p) =>
            p.consultation_id === c.consultation_id && p.status === "initiated"
        ))
          if (Date.now() - p.created_at > 3000) {
            p.status = "confirmed"
            p.confirmed_at = Date.now()
            if (c.status === "pending_payment") c.status = "paid"
          }
        return {
          consultation: c,
          messages: ctx.data.messages.filter(
            (m) => m.consultation_id === c.consultation_id
          ),
        }
      },
    ],
    [
      "POST",
      /^\/anonymous\/consultations\/([^/]+)\/messages$/,
      (ctx) => {
        const sub = anon(ctx),
          c = ctx.data.consultations.find(
            (c) => c.consultation_id === ctx.params[0] && c.patient_id === sub
          )
        if (!c) throw new ApiError(404, "Consultation not found")
        const body = required(ctx.body.text_body, "text_body"),
          client = required(ctx.body.client_message_id, "client_message_id")
        if (body.length > 4000) throw new ApiError(400, "Message too long")
        const existing = ctx.data.messages.find(
          (m) => m.client_message_id === client
        )
        if (existing) {
          if (
            existing.consultation_id !== c.consultation_id ||
            existing.sender_id !== sub
          )
            throw new ApiError(409, "client_message_id already used")
          return existing
        }
        const m: Message = {
          consultation_id: c.consultation_id,
          message_id: uuid(),
          sender_id: sub,
          sender_role: "patient",
          content_type: "text",
          text_body: body,
          voice_note_key: null,
          duration_seconds: null,
          client_message_id: client,
          created_at: Date.now(),
        }
        ctx.data.messages.push(m)
        return m
      },
    ],
    [
      "POST",
      /^\/anonymous\/payments\/initiate$/,
      (ctx) => {
        const sub = anon(ctx),
          c = ctx.data.consultations.find(
            (c) =>
              c.consultation_id === ctx.body.consultation_id &&
              c.patient_id === sub
          )
        if (!c) throw new ApiError(404, "Consultation not found")
        if (c.status !== "pending_payment")
          throw new ApiError(409, "Consultation is not awaiting payment")
        const p: Payment = {
          payment_id: uuid(),
          consultation_id: c.consultation_id,
          payer_id: sub,
          patient_id: sub,
          amount_xaf: 2000,
          fapshi_ref: `MOCK-${uuid().slice(0, 8)}`,
          status: "initiated",
          created_at: Date.now(),
          confirmed_at: null,
        }
        ctx.data.payments.push(p)
        return {
          payment_id: p.payment_id,
          payment_url: String(ctx.body.redirect_url),
          fapshi_ref: p.fapshi_ref,
        }
      },
    ],
  ]
}
