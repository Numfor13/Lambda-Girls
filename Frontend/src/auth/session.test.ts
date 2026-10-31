import { describe, expect, it, vi } from "vitest"
import type { User } from "oidc-client-ts"
vi.mock("@/config/env", () => ({
  env: {
    cognito: { authority: "patient", clientId: "p" },
    cognitoStaff: { authority: "staff", clientId: "s" },
  },
  authConfigured: true,
  staffAuthConfigured: true,
}))
import { sessionFromUser } from "./session"
const user = {
  profile: {
    sub: "id",
    email: "test@example.test",
    "cognito:groups": ["Patient", "Admin", "Doctor"],
  },
  id_token: "id-token",
} as unknown as User
describe("patient and staff session separation", () => {
  it("never promotes patient-pool group claims into staff access", () => {
    expect(sessionFromUser(user, "patient").groups).toEqual(["Patient"])
  })
  it("accepts staff roles only and sends the ID token", () => {
    const session = sessionFromUser(user, "staff")
    expect(session.groups).toEqual(["Admin", "Doctor"])
    expect(session.idToken).toBe("id-token")
  })
  it("does not fall back to Patient for an unassigned staff account", () => {
    expect(
      sessionFromUser({ profile: { sub: "id" } } as User, "staff").groups
    ).toEqual([])
  })
})
