import { describe, expect, it } from "vitest"
import type { Session } from "@/auth/session"
import { authDestination, safeReturn } from "./destination"

const patient: Session = {
  sub: "demo-patient",
  name: "Demo",
  groups: ["Patient"],
  idToken: "",
  demo: true,
}
const doctor: Session = { ...patient, groups: ["Doctor"] }

describe("sign-in return destinations", () => {
  it.each([
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/app\n/consults",
    "/sign-in",
    "/auth/callback",
  ])("rejects unsafe or looping destination %j", (target) => {
    expect(safeReturn(target)).toBeNull()
  })
  it("keeps a patient consultation deep link", () => {
    expect(authDestination(patient, "/app/consult/demo?from=signin")).toBe(
      "/app/consult/demo?from=signin"
    )
  })
  it("keeps doctor case deep links", () => {
    expect(authDestination(doctor, "/doctor/case/demo")).toBe(
      "/doctor/case/demo"
    )
  })
  it("returns each role home when the requested destination belongs to the other role", () => {
    expect(authDestination(patient, "/doctor/case/demo")).toBe("/app")
    expect(authDestination(doctor, "/app/profile")).toBe("/doctor")
  })
  it("does not mistake a similarly named public path for a doctor route", () => {
    expect(authDestination(doctor, "/doctor-information")).toBe("/doctor")
  })
  it("keeps authorized operator and admin deep links", () => {
    expect(
      authDestination({ ...patient, groups: ["Operator"] }, "/operator/labs")
    ).toBe("/operator/labs")
    expect(
      authDestination({ ...patient, groups: ["Admin"] }, "/admin/tips")
    ).toBe("/admin/tips")
  })
  it("rejects another staff workspace and protects segment boundaries", () => {
    expect(authDestination(patient, "/operator")).toBe("/app")
    expect(
      authDestination({ ...patient, groups: ["Operator"] }, "/admin")
    ).toBe("/operator")
    expect(
      authDestination({ ...patient, groups: ["Admin"] }, "/operator")
    ).toBe("/admin")
    expect(
      authDestination({ ...patient, groups: ["Admin"] }, "/administrator")
    ).toBe("/admin")
    expect(
      authDestination(
        { ...patient, groups: ["Doctor", "Admin"] },
        "/admin/tips"
      )
    ).toBe("/admin/tips")
  })
})
