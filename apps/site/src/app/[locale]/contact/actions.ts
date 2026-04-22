"use server";

export async function submitContact(_formData: FormData) {
  // TODO(claude): wire to real ingestion (CRM / email). For now this is a no-op stub.
  return { ok: true };
}
