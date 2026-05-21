import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminRequest, methodNotAllowed, PLAN_DOC_PATH, readPlan, STORAGE_KEY } from "./_shared.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    try {
      const plan = await readPlan();
      res.status(200).json({ plan });
    } catch (error) {
      console.error("Failed to read plan", error);
      res.status(500).json({ error: "Failed to read plan" });
    }
    return;
  }

  if (req.method === "PUT") {
    console.log("🔍 [PLAN PUT DEBUG] 开始处理 PUT 请求");
    
    if (!isAdminRequest(req)) {
      console.log("❌ [PLAN PUT DEBUG] 未授权：无效的会话");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    console.log("✅ [PLAN PUT DEBUG] 会话验证成功");

    const db = getAdminDb();
    if (!db) {
      console.error("❌ [PLAN PUT DEBUG] Firebase Admin 未配置");
      res.status(503).json({ error: "Firebase Admin is not configured" });
      return;
    }
    console.log("✅ [PLAN PUT DEBUG] Firebase Admin 已连接");

    if (!req.body?.data || typeof req.body.data !== "object") {
      console.error("❌ [PLAN PUT DEBUG] 请求体无效");
      res.status(400).json({ error: "Request body must include data" });
      return;
    }
    console.log("✅ [PLAN PUT DEBUG] 请求体验证成功");

    try {
      console.log("   正在保存到 Firestore:", PLAN_DOC_PATH);
      const ref = db.collection(PLAN_DOC_PATH[0]).doc(PLAN_DOC_PATH[1]);
      await ref.set(
        {
          data: req.body.data,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: "shared-password-admin",
          title: "《合奏 Ensemble》流程安排",
          schemaVersion: req.body.schemaVersion || STORAGE_KEY,
        },
        { merge: true },
      );
      console.log("✅ [PLAN PUT DEBUG] 数据保存成功");
      const plan = await readPlan();
      res.status(200).json({ plan });
    } catch (error) {
      console.error("❌ [PLAN PUT DEBUG] 保存失败:", error);
      res.status(500).json({ error: "Failed to save plan" });
    }
    return;
  }

  methodNotAllowed(res, ["GET", "PUT"]);
}
