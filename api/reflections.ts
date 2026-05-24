import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getAdminDb, methodNotAllowed } from "./_shared";

const REFLECTIONS_COLLECTION = process.env.FIREBASE_REFLECTIONS_COLLECTION || "courseReflections";

type ReflectionInput = {
  name?: unknown;
  note?: unknown;
  audioUrl?: unknown;
  mediaType?: unknown;
};

type SaveFailureReason =
  | "firebase-not-configured"
  | "validation"
  | "firestore-write-failed"
  | "server-error";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function serializeReflection(id: string, data: DocumentData) {
  return {
    id,
    name: String(data.name || ""),
    note: String(data.note || ""),
    audioUrl: String(data.audioUrl || ""),
    mediaType: String(data.mediaType || ""),
    timestamp: String(data.timestamp || new Date(0).toISOString()),
  };
}

function sendSaveError(res: VercelResponse, reason: SaveFailureReason, message: string, status = 200) {
  res.status(status).json({
    ok: false,
    reason,
    error: message,
  });
}

async function listReflections(res: VercelResponse) {
  const db = getAdminDb();
  if (!db) {
    res.status(200).json({
      reflections: [],
      warning: "Firebase Admin is not configured",
    });
    return;
  }

  try {
    const snapshot = await db.collection(REFLECTIONS_COLLECTION).orderBy("timestamp", "desc").limit(120).get();
    res.status(200).json({
      reflections: snapshot.docs.map((doc) => serializeReflection(doc.id, doc.data())),
    });
  } catch (error) {
    console.error("Failed to list reflections", error);
    res.status(200).json({
      reflections: [],
      warning: error instanceof Error ? error.message : "无法读取课程总结",
    });
  }
}

async function createReflection(input: ReflectionInput, res: VercelResponse) {
  const db = getAdminDb();
  if (!db) {
    sendSaveError(
      res,
      "firebase-not-configured",
      "Firebase Admin is not configured. 请检查 FIREBASE_SERVICE_ACCOUNT_JSON、FIREBASE_PROJECT_ID 和 FIREBASE_DATABASE_ID。",
    );
    return;
  }

  const name = normalizeString(input?.name);
  const note = normalizeString(input?.note);
  const audioUrl = normalizeString(input?.audioUrl);
  const mediaType = normalizeString(input?.mediaType) || "application/octet-stream";

  if (!name) {
    sendSaveError(res, "validation", "请输入学生姓名");
    return;
  }
  if (!audioUrl || !/^https:\/\/.+/i.test(audioUrl)) {
    sendSaveError(res, "validation", "缺少有效的 audioUrl");
    return;
  }
  if (!mediaType.startsWith("audio/") && !mediaType.startsWith("video/") && mediaType !== "application/octet-stream") {
    sendSaveError(res, "validation", "文件类型无效");
    return;
  }

  const timestamp = new Date().toISOString();
  const ref = db.collection(REFLECTIONS_COLLECTION).doc();
  const reflection = {
    id: ref.id,
    name,
    note,
    audioUrl,
    mediaType,
    timestamp,
    createdAt: FieldValue.serverTimestamp(),
    requestId: crypto.randomUUID(),
  };

  try {
    await ref.set(reflection);
    res.status(201).json({ ok: true, reflection: serializeReflection(ref.id, reflection) });
  } catch (error) {
    console.error("Failed to create reflection", error);
    sendSaveError(
      res,
      "firestore-write-failed",
      error instanceof Error ? error.message : "Firestore 写入失败",
    );
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      await listReflections(res);
      return;
    }

    if (req.method === "POST") {
      await createReflection(req.body, res);
      return;
    }

    methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    console.error("Reflection API failed", error);
    sendSaveError(res, "server-error", error instanceof Error ? error.message : "服务器错误");
  }
}
