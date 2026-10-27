import { describe, expect, it } from "vitest"
import type { Payment } from "@/api/types"
import { receiptHtml, receiptText } from "./receipt"

const payment: Payment = { payment_id: "payment", consultation_id: "private-consultation", payer_id: "private-user", patient_id: "private-patient", amount_xaf: 2000, fapshi_ref: "reference", status: "confirmed", receipt_data: { reference: '<script>alert("test")</script>', amount: 2000, timestamp: 0, payer_phone: "+237677000000" }, created_at: 0, confirmed_at: 0 }
describe("receipt export", () => {
  it("escapes untrusted receipt fields and excludes unrelated health records", () => {
    const html = receiptHtml(payment)
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("private-consultation")
    expect(html).not.toContain("private-user")
    expect(html).not.toContain("private-patient")
  })
  it("includes the actual payment reference, amount and optional payer phone", () => {
    const text = receiptText({ ...payment, receipt_data: undefined })
    expect(text).toContain("Reference: reference")
    expect(text).toContain("2,000")
    expect(text).not.toContain("Payer phone")
  })
})
