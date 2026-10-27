import { apiClient } from "@/lib/api-client";

export type DemoPayResult = "processing" | "declined";

/**
 * Demo stand-in for confirming a payment with Stripe.js. Only the mock server implements this
 * endpoint (it is not in the API contract); the real flow is Stripe Payment Element + webhook.
 */
export async function demoPay(
  bookingId: string,
  method: "CARD" | "PROMPTPAY",
): Promise<DemoPayResult> {
  const response = await apiClient<{ data: { result: DemoPayResult } }>("/__demo/pay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId, method }),
  });
  return response.data.result;
}
