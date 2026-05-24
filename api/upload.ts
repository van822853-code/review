import path from "node:path";
import { put } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_UPLOAD_BYTES = Number(process.env.MAX_REFLECTION_UPLOAD_BYTES || 250 * 1024 * 1024);

function sanitizeFileName(value: string) {
  const decoded = decodeURIComponent(value || "reflection-upload");
  const extension = path.extname(decoded).slice(0, 12);
  const baseName = path
    .basename(decoded, extension)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${baseName || "reflection"}${extension || ".bin"}`;
}

async function readRequestBuffer(req: VercelRequest) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_UPLOAD_BYTES) {
      throw new Error("文件过大，请压缩后再上传");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const contentType = req.headers["content-type"] || "application/octet-stream";
    if (!String(contentType).startsWith("audio/") && !String(contentType).startsWith("video/")) {
      res.status(400).json({ error: "请上传音频或视频文件" });
      return;
    }

    const body = await readRequestBuffer(req);
    if (!body.length) {
      res.status(400).json({ error: "没有收到文件内容" });
      return;
    }

    const fileName = sanitizeFileName(String(req.headers["x-file-name"] || ""));
    const blob = await put(`reflections/${Date.now()}-${fileName}`, body, {
      access: "public",
      contentType: String(contentType),
      addRandomSuffix: true,
    });

    res.status(200).json({
      url: blob.url,
      mediaType: String(contentType),
      size: body.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传失败";
    const statusCode = message.includes("BLOB_READ_WRITE_TOKEN") ? 503 : 500;
    res.status(statusCode).json({ error: message });
  }
}
