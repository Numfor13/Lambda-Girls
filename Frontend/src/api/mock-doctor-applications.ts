import { ApiError } from "./errors"
import {
  APPLICATION_STATUSES,
  CHECKS,
  DOCUMENTS,
  applicationIdValid,
  type ApplicationDetail,
  type ApplicationFields,
  type ApplicationStatus,
  type DoctorApplication,
} from "./doctor-applications"
import { SPECIALTIES } from "./types"

interface Context {
  params: string[]
  body: Record<string, unknown>
  query: URLSearchParams
  user: { sub: string; isDoctor: boolean } | null
  data: { doctorApplications?: DoctorApplication[] }
}
type Route = [string, RegExp, (ctx: Context) => unknown]
const fail = (status: number, message: string): never => {
  throw new ApiError(status, message)
}
const open = (a: DoctorApplication) =>
  ["pending", "under_review"].includes(a.status)
const active = (a: DoctorApplication) =>
  ["pending", "under_review", "approving", "approved"].includes(a.status)
export function applicationMockRoutes(): Route[] {
  const db = (ctx: Context) => (ctx.data.doctorApplications ??= [])
  const get = (ctx: Context) =>
    db(ctx).find((x) => x.application_id === ctx.params[0]) ??
    fail(404, "Application not found")
  const admin = (ctx: Context) => {
    if (!ctx.user) fail(401, "Unauthorized")
    if (ctx.user?.sub !== "demo-admin-1") fail(403, "Admin group required")
  }
  const privateGet = (ctx: Context) => {
    admin(ctx)
    return get(ctx)
  }
  return [
    [
      "POST",
      /^\/doctor-applications\/uploads$/,
      (ctx) => {
        const d = ctx.body.documents as Record<string, string> | undefined
        if (
          !d ||
          Object.keys(d).length !== DOCUMENTS.length ||
          DOCUMENTS.some(
            (x) =>
              !(
                x.key === "selfie_with_ids"
                  ? ["image/jpeg", "image/png"]
                  : ["application/pdf", "image/jpeg", "image/png"]
              ).includes(d[x.key])
          )
        )
          fail(400, "Select all five documents with valid content types")
        return {
          application_id: crypto.randomUUID(),
          expires_in: 900,
          uploads: Object.fromEntries(
            DOCUMENTS.map((x) => [x.key, { url: "", fields: {} }])
          ),
        }
      },
    ],
    [
      "POST",
      /^\/doctor-applications$/,
      (ctx) => {
        const b = ctx.body
        if (!applicationIdValid(String(b.application_id)))
          fail(400, "Invalid application ID")
        if (db(ctx).some((x) => x.application_id === b.application_id))
          fail(409, "This application has already been submitted")
        for (const [key, limit] of Object.entries({
          full_name: 120,
          medical_school: 200,
          identity_document_number: 40,
        })) {
          if (
            typeof b[key] !== "string" ||
            !(b[key] as string).trim() ||
            (b[key] as string).trim().length > limit
          )
            fail(400, key + " is required")
        }
        if (
          typeof b.email !== "string" ||
          !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email) ||
          b.email.length > 254
        )
          fail(400, "Invalid email")
        if (typeof b.phone !== "string" || !/^\+\d{8,15}$/.test(b.phone))
          fail(400, "Phone must be in international format")
        if (!SPECIALTIES.some((x) => x.value === b.specialty))
          fail(400, "Invalid specialty")
        const match = String(b.onmc_number)
          .trim()
          .toUpperCase()
          .match(/^([A-Z0-9]{1,8})\/(\d{4})$/)
        const year = new Date().getFullYear()
        if (!match || +match[2] < 1950 || +match[2] > year)
          fail(400, "Invalid ONMC number")
        if (
          !Number.isInteger(b.graduation_year) ||
          Number(b.graduation_year) < 1950 ||
          Number(b.graduation_year) > year
        )
          fail(400, "Invalid graduation year")
        if (!["cni", "passport"].includes(String(b.identity_document_type)))
          fail(400, "Invalid identity document type")
        const email = String(b.email).trim().toLowerCase()
        if (db(ctx).some((x) => x.email === email && active(x)))
          fail(
            409,
            "This email already has an application in progress or an account."
          )
        const onmc_number =
          (match![1].replace(/^0+/, "") || "0") + "/" + match![2]
        const a: DoctorApplication = {
          ...(b as unknown as ApplicationFields),
          full_name: String(b.full_name).trim(),
          medical_school: String(b.medical_school).trim(),
          identity_document_number: String(b.identity_document_number).trim(),
          email,
          onmc_number,
          application_id: String(b.application_id),
          status: "pending",
          checks: {
            onmc_register_verified: false,
            documents_consistent: false,
            selfie_matches: false,
          },
          admin_notes: "",
          duplicate_onmc: db(ctx).some((x) => x.onmc_number === onmc_number),
          submitted_at: Date.now(),
          updated_at: Date.now(),
        }
        db(ctx).push(a)
        return { application_id: a.application_id, status: a.status }
      },
    ],
    [
      "GET",
      /^\/doctor-applications\/([^/]+)$/,
      (ctx) => {
        const a = get(ctx)
        return {
          application_id: a.application_id,
          status: a.status,
          submitted_at: a.submitted_at,
          reviewed_at: a.reviewed_at ?? null,
          rejection_reason: a.rejection_reason ?? null,
        }
      },
    ],
    [
      "GET",
      /^\/admin\/doctor-applications$/,
      (ctx) => {
        admin(ctx)
        const status = ctx.query.get("status") || "pending"
        if (!APPLICATION_STATUSES.includes(status as ApplicationStatus))
          fail(400, "Invalid status")
        const applications = db(ctx)
          .filter((x) => x.status === status)
          .sort((a, b) => b.submitted_at - a.submitted_at)
        return { applications, count: applications.length }
      },
    ],
    [
      "GET",
      /^\/admin\/doctor-applications\/([^/]+)$/,
      (ctx) => {
        const a = privateGet(ctx)
        const others = (key: "email" | "onmc_number") =>
          db(ctx)
            .filter(
              (x) => x.application_id !== a.application_id && x[key] === a[key]
            )
            .map((x) => ({
              application_id: x.application_id,
              status: x.status,
            }))
        return {
          ...a,
          document_urls: {},
          duplicates: {
            email: others("email"),
            onmc_number: others("onmc_number"),
          },
        } satisfies ApplicationDetail
      },
    ],
    [
      "PUT",
      /^\/admin\/doctor-applications\/([^/]+)$/,
      (ctx) => {
        const a = privateGet(ctx)
        if (!open(a)) fail(409, "Application is already " + a.status)
        const notes = ctx.body.admin_notes
        const checks = ctx.body.checks as Record<string, boolean> | undefined
        if (
          typeof notes !== "string" ||
          notes.length > 2000 ||
          !checks ||
          Object.entries(checks).some(
            ([k, v]) =>
              !CHECKS.some((c) => c.key === k) || typeof v !== "boolean"
          )
        )
          fail(400, "Invalid notes or checks")
        Object.assign(a, {
          admin_notes: notes,
          checks: { ...a.checks, ...checks },
          status: "under_review",
          updated_at: Date.now(),
        })
        return { updated: a.application_id, status: a.status, checks: a.checks }
      },
    ],
    [
      "POST",
      /^\/admin\/doctor-applications\/([^/]+)\/approve$/,
      (ctx) => {
        const a = privateGet(ctx)
        if (!open(a) && a.status !== "approving")
          fail(409, "Application is already " + a.status)
        if (!CHECKS.every((c) => a.checks[c.key]))
          fail(409, "Confirm every verification check before approving")
        if (
          db(ctx).some(
            (x) =>
              x.application_id !== a.application_id &&
              x.onmc_number === a.onmc_number &&
              ["approving", "approved"].includes(x.status)
          )
        )
          fail(
            409,
            "Another application with this ONMC number is already approved"
          )
        Object.assign(a, {
          status: "approved",
          reviewed_at: Date.now(),
          updated_at: Date.now(),
          doctor_user_id: crypto.randomUUID(),
        })
        return { approved: a.application_id, email: a.email }
      },
    ],
    [
      "POST",
      /^\/admin\/doctor-applications\/([^/]+)\/reject$/,
      (ctx) => {
        const a = privateGet(ctx)
        if (!open(a)) fail(409, "Application is already " + a.status)
        const reason = ctx.body.reason
        if (
          typeof reason !== "string" ||
          !reason.trim() ||
          reason.trim().length > 500
        )
          fail(400, "A reason of at most 500 characters is required")
        Object.assign(a, {
          status: "rejected",
          rejection_reason: String(reason).trim(),
          reviewed_at: Date.now(),
          updated_at: Date.now(),
        })
        return { rejected: a.application_id }
      },
    ],
    [
      "POST",
      /^\/admin\/doctor-applications\/([^/]+)\/resend-invite$/,
      (ctx) => {
        const a = privateGet(ctx)
        if (a.status !== "approved")
          fail(409, "Only approved applications have an invitation")
        return { resent: a.application_id }
      },
    ],
  ]
}
