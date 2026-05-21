import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSessionToken, methodNotAllowed, normalizeAdminPassword, setAdminCookie } from "../_shared.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  // 调试日志：环境变量检查
  const rawEnvPassword = process.env.ADMIN_PASSWORD;
  console.log("🔍 [LOGIN DEBUG]");
  console.log("  原始环境变量:", JSON.stringify(rawEnvPassword));
  console.log("  环境变量长度:", rawEnvPassword?.length ?? 0);
  console.log("  环境变量类型:", typeof rawEnvPassword);
  console.log("  环境变量字符编码:", rawEnvPassword?.split("").map((c, i) => `[${i}]='${c}'(code:${c.charCodeAt(0)})`).join(", "));

  const configuredPassword = normalizeAdminPassword(rawEnvPassword);
  console.log("  规范化后密码:", JSON.stringify(configuredPassword));
  console.log("  规范化后长度:", configuredPassword.length);
  
  if (!configuredPassword) {
    console.log("❌ ADMIN_PASSWORD 未配置或为空");
    res.status(503).json({ 
      error: "ADMIN_PASSWORD is not configured",
      debug: {
        rawEnvExists: Boolean(rawEnvPassword),
        normalizedEmpty: true
      }
    });
    return;
  }

  // 调试日志：用户输入检查
  const userInput = req.body?.password;
  const normalizedUserInput = normalizeAdminPassword(userInput);
  console.log("  用户输入:", JSON.stringify(userInput));
  console.log("  用户输入长度:", userInput?.length ?? 0);
  console.log("  用户输入规范化后:", JSON.stringify(normalizedUserInput));
  console.log("  用户输入规范化后长度:", normalizedUserInput.length);
  console.log("  用户输入字符编码:", normalizedUserInput.split("").map((c, i) => `[${i}]='${c}'(code:${c.charCodeAt(0)})`).join(", "));

  // 调试日志：密码比对
  console.log("  配置密码 === 用户输入?", configuredPassword === normalizedUserInput);
  console.log("  配置: ", JSON.stringify(configuredPassword.split("")));
  console.log("  输入: ", JSON.stringify(normalizedUserInput.split("")));

  if (normalizedUserInput !== configuredPassword) {
    console.log("❌ 密码验证失败");
    res.status(401).json({ 
      error: "Invalid password",
      debug: {
        configuredLength: configuredPassword.length,
        inputLength: normalizedUserInput.length,
        match: false
      }
    });
    return;
  }

  console.log("✅ 密码验证成功");
  setAdminCookie(res, createSessionToken());
  res.status(200).json({ authenticated: true });
}
