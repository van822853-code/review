import type { VercelResponse } from "@vercel/node";

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_REFLECTION_UPLOAD_BYTES || 250 * 1024 * 1024);
export const UPLOAD_API_BASE = (process.env.VAD_UPLOAD_API_BASE || "https://vad-video-upload-api.saintmob.workers.dev").replace(/\/+$/, "");

export function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function jsonError(res: VercelResponse, status: number, error: string) {
  res.status(status).json({ error });
}

export function getUploadApiKey() {
  return normalizeString(process.env.VAD_UPLOAD_API_KEY);
}

function parseResponseBody(text: string) {
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text.slice(0, 240) };
  }
}

export async function callUploadApi<T>(path: string, body: unknown): Promise<T> {
  const apiKey = getUploadApiKey();
  if (!apiKey) {
    throw new Error("VAD_UPLOAD_API_KEY is not configured");
  }

  const response = await fetch(`${UPLOAD_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = parseResponseBody(text);

  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : `Upload API failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}
