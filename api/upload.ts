import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const MAX_UPLOAD_BYTES = Number(process.env.MAX_REFLECTION_UPLOAD_BYTES || 250 * 1024 * 1024);

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const pathname = normalizeString(req.body?.pathname);
    const contentType = normalizeString(req.body?.contentType) || "video/webm";
    const size = Number(req.body?.size || 0);

    if (!pathname.startsWith("reflections/")) {
      res.status(400).json({ error: "Invalid upload pathname" });
      return;
    }
    if (!contentType.startsWith("video/")) {
      res.status(400).json({ error: "Only recorded videos can be uploaded" });
      return;
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
      res.status(400).json({ error: "录制视频体积无效或超过上限" });
      return;
    }

    const clientToken = await generateClientTokenFromReadWriteToken({
      pathname,
      allowedContentTypes: ["video/*"],
      maximumSizeInBytes: MAX_UPLOAD_BYTES,
      addRandomSuffix: true,
    });

    res.status(200).json({ clientToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传令牌生成失败";
    const statusCode = message.includes("BLOB_READ_WRITE_TOKEN") || message.includes("Invalid `BLOB") ? 503 : 400;
    res.status(statusCode).json({ error: message });
  }
}
