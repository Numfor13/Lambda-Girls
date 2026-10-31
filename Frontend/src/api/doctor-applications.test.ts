import { describe, expect, it, vi } from "vitest"
vi.mock("./client", () => ({ request: vi.fn() }))
import { applicationMockRoutes } from "./mock-doctor-applications"
import {
  DOCUMENTS,
  documentError,
  type ApplicationDetail,
  type DoctorApplication,
  type PublicApplicationStatus,
} from "./doctor-applications"
const fields = {
  full_name: "Demo applicant",
  email: "demo@example.test",
  phone: "+237677000000",
  specialty: "general_practice",
  medical_school: "Demo school",
  graduation_year: 2020,
  onmc_number: "12345/2019",
  identity_document_type: "cni",
  identity_document_number: "DEMO-NOT-AN-ID",
}
function harness() {
  const routes = applicationMockRoutes()
  type Context = Parameters<(typeof routes)[number][2]>[0]
  const data: Context["data"] = {}
  const call = <T>(
    method: string,
    url: string,
    body: Record<string, unknown> = {},
    sub = "demo-admin-1"
  ): T => {
    const [path, qs] = url.split("?")
    const route = routes.find(([m, re]) => m === method && re.test(path))!
    return route[2]({
      params: path.match(route[1])!.slice(1),
      query: new URLSearchParams(qs),
      body,
      user: sub ? { sub, isDoctor: sub === "demo-doctor-1" } : null,
      data,
    }) as T
  }
  const submit = (patch = {}) => {
    const r = call<{ application_id: string }>(
      "POST",
      "/doctor-applications/uploads",
      {
        documents: Object.fromEntries(
          DOCUMENTS.map((d) => [d.key, "image/jpeg"])
        ),
      },
      ""
    )
    call(
      "POST",
      "/doctor-applications",
      { ...fields, ...patch, application_id: r.application_id },
      ""
    )
    return r.application_id
  }
  return { call, submit, data }
}
const allChecks = {
  onmc_register_verified: true,
  documents_consistent: true,
  selfie_matches: true,
}
describe("verified doctor onboarding", () => {
  it("requires all five document types and rejects PDF selfies and oversize/empty files", () => {
    const h = harness()
    expect(() =>
      h.call("POST", "/doctor-applications/uploads", { documents: {} }, "")
    ).toThrow()
    const docs = Object.fromEntries(
      DOCUMENTS.map((d) => [d.key, "application/pdf"])
    )
    expect(() =>
      h.call("POST", "/doctor-applications/uploads", { documents: docs }, "")
    ).toThrow()
    expect(
      documentError({ type: "application/pdf", size: 100 }, "selfie_with_ids")
    ).toBeTruthy()
    expect(
      documentError(
        { type: "image/jpeg", size: 5 * 1024 * 1024 + 1 },
        "identity_document"
      )
    ).toBeTruthy()
    expect(
      documentError({ type: "image/jpeg", size: 0 }, "identity_document")
    ).toBeTruthy()
    expect(
      documentError(
        { type: "image/jpeg", size: 5 * 1024 * 1024 },
        "selfie_with_ids"
      )
    ).toBeUndefined()
  })
  it("keeps public status free of personal fields and denies every non-admin role", () => {
    const h = harness(),
      id = h.submit()
    const publicStatus = h.call<PublicApplicationStatus>(
      "GET",
      "/doctor-applications/" + id,
      {},
      ""
    )
    expect(Object.keys(publicStatus).sort()).toEqual(
      [
        "application_id",
        "status",
        "submitted_at",
        "reviewed_at",
        "rejection_reason",
      ].sort()
    )
    expect(typeof publicStatus.submitted_at).toBe("number")
    for (const sub of [
      "",
      "demo-patient-1",
      "demo-doctor-1",
      "demo-operator-1",
    ]) {
      expect(() =>
        h.call("GET", "/admin/doctor-applications/" + id, {}, sub)
      ).toThrow()
      expect(() =>
        h.call("POST", "/admin/doctor-applications/" + id + "/approve", {}, sub)
      ).toThrow()
    }
  })
  it("requires saved checks, separates status lists and prevents terminal decisions being edited", () => {
    const h = harness(),
      id = h.submit()
    expect(() =>
      h.call("POST", "/admin/doctor-applications/" + id + "/approve")
    ).toThrow("verification")
    h.call("PUT", "/admin/doctor-applications/" + id, {
      admin_notes: "Demo verification",
      checks: allChecks,
    })
    expect(
      h.call<{ count: number }>("GET", "/admin/doctor-applications").count
    ).toBe(0)
    expect(
      h.call<{ count: number }>(
        "GET",
        "/admin/doctor-applications?status=under_review"
      ).count
    ).toBe(1)
    h.call("POST", "/admin/doctor-applications/" + id + "/approve")
    expect(
      h.call<ApplicationDetail>("GET", "/admin/doctor-applications/" + id)
        .status
    ).toBe("approved")
    expect(() =>
      h.call("PUT", "/admin/doctor-applications/" + id, {
        admin_notes: "edit",
        checks: {},
      })
    ).toThrow("already approved")
    expect(() =>
      h.call("POST", "/admin/doctor-applications/" + id + "/reject", {
        reason: "Demo",
      })
    ).toThrow("already approved")
    expect(
      h.call<{ resent: string }>(
        "POST",
        "/admin/doctor-applications/" + id + "/resend-invite"
      ).resent
    ).toBe(id)
  })
  it("normalizes duplicate email and ONMC numbers, flags duplicates and blocks a second approval", () => {
    const h = harness(),
      id = h.submit()
    expect(() => h.submit({ email: "DEMO@example.test" })).toThrow("email")
    const second = h.submit({
      email: "second@example.test",
      onmc_number: "012345/2019",
    })
    expect(
      h.call<ApplicationDetail>("GET", "/admin/doctor-applications/" + second)
        .duplicate_onmc
    ).toBe(true)
    for (const key of [id, second])
      h.call("PUT", "/admin/doctor-applications/" + key, {
        admin_notes: "",
        checks: allChecks,
      })
    h.call("POST", "/admin/doctor-applications/" + id + "/approve")
    expect(() =>
      h.call("POST", "/admin/doctor-applications/" + second + "/approve")
    ).toThrow("already approved")
  })
  it("retains rejection reasons in public status and refuses missing or overlong reasons", () => {
    const h = harness(),
      id = h.submit()
    for (const reason of ["", " ", "x".repeat(501)])
      expect(() =>
        h.call("POST", "/admin/doctor-applications/" + id + "/reject", {
          reason,
        })
      ).toThrow()
    h.call("POST", "/admin/doctor-applications/" + id + "/reject", {
      reason: "Please provide readable documents.",
    })
    expect(
      h.call<PublicApplicationStatus>(
        "GET",
        "/doctor-applications/" + id,
        {},
        ""
      ).rejection_reason
    ).toBe("Please provide readable documents.")
    expect(
      h.call<{ applications: DoctorApplication[] }>(
        "GET",
        "/admin/doctor-applications?status=rejected"
      ).applications
    ).toHaveLength(1)
  })
})
