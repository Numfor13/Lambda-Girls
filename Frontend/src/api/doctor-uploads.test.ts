import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("./client", () => ({ request: vi.fn() }))
vi.mock("@/config/env", () => ({ env: { useMockApi: false } }))
import {
  uploadApplicationDocument,
  type UploadReservation,
} from "./doctor-applications"
afterEach(() => vi.unstubAllGlobals())
const signedUpload = {
  url: "https://uploads.example.test",
  fields: {
    key: "drafts/id/onmc_card",
    policy: "signed-policy",
    "Content-Type": "image/png",
  },
}
const reservation: UploadReservation = {
  application_id: "id",
  expires_in: 900,
  uploads: {
    onmc_certificate: signedUpload,
    onmc_card: signedUpload,
    medical_degree: signedUpload,
    identity_document: signedUpload,
    selfie_with_ids: signedUpload,
  },
}

describe("private document uploads", () => {
  it("uses all presigned POST fields, keeps file last and lets the browser set the boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    const file = new File(["demo"], "demo.png", { type: "image/png" })
    await uploadApplicationDocument(reservation, "onmc_card", file)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("https://uploads.example.test")
    expect(options.method).toBe("POST")
    expect(options.credentials).toBe("omit")
    expect(options.headers).toBeUndefined()
    expect(Array.from((options.body as FormData).keys())).toEqual([
      "key",
      "policy",
      "Content-Type",
      "file",
    ])
    expect((options.body as FormData).get("file")).toBeInstanceOf(File)
  })
  it("stops when S3 rejects an upload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))
    await expect(
      uploadApplicationDocument(
        reservation,
        "onmc_card",
        new File(["demo"], "demo.png", { type: "image/png" })
      )
    ).rejects.toThrow("upload failed")
  })
})
