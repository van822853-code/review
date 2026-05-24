import type { VercelRequest, VercelResponse } from "@vercel/node";
import { callUploadApi, jsonError, normalizeString } from "./_shared.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    jsonError(res, 405, "Method not allowed");
    return;
  }

  try {
    const uploadId = normalizeString(req.body?.uploadId);
    if (!uploadId) {
      jsonError(res, 400, "Missing uploadId");
      return;
    }

    const payload = await callUploadApi("/api/uploads/complete", { uploadId });
    res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法确认视频上传";
    const status = message.includes("VAD_UPLOAD_API_KEY") ? 503 : 502;
    jsonError(res, status, message);
  }
}
