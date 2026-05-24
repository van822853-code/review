import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSessionToken, methodNotAllowed, normalizeAdminPassword, setAdminCookie } from "../_shared.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const rawEnvPassword = process.env.ADMIN_PASSWORD;
  const configuredPassword = normalizeAdminPassword(rawEnvPassword);
  
  if (!configuredPassword) {
    console.log("❌ ADMIN_PASSWORD 未配置或为空");
    res.status(503).json({ error: "ADMIN_PASSWORD is not configured" });
    return;
  }

  if (normalizeAdminPassword(req.body?.password) !== configuredPassword) {
    console.log("❌ 密码验证失败");
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  console.log("✅ 密码验证成功");
  setAdminCookie(res, createSessionToken());
  res.status(200).json({ authenticated: true });
}
