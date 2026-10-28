import type { Payment } from "@/api/types"
import { formatDateTime, formatXaf } from "./format"

export function receiptText(p: Payment) {
  return ["CareBridge · Payment receipt", `Reference: ${p.receipt_data?.reference || p.fapshi_ref}`, `Paid: ${formatXaf(p.receipt_data?.amount ?? p.amount_xaf)}`, `Date: ${formatDateTime(p.receipt_data?.timestamp ?? p.confirmed_at ?? p.created_at)}`, ...(p.receipt_data?.payer_phone ? [`Payer phone: ${p.receipt_data.payer_phone}`] : [])].join("\n")
}
export function receiptHtml(p: Payment) {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;")
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>CareBridge receipt</title><style>body{font-family:Inter,Arial,sans-serif;margin:2rem;line-height:1.5}h1{font-size:2rem}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>CareBridge</h1><pre>${escape(receiptText(p))}</pre></html>`
}
export function printReceipt(p: Payment) {
  const preview = window.open("", "_blank", "width=800,height=720")
  if (!preview) throw new Error("Print preview was blocked. Allow a pop-up for this page and try again.")
  preview.opener = null
  preview.document.open()
  preview.document.write(receiptHtml(p))
  preview.document.close()
  preview.requestAnimationFrame(() => { preview.focus(); preview.print() })
}
