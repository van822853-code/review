# 回响

课程总结播放与上传页面。`/` 是播放界面，`/upload` 是学生上传界面。学生填写姓名后开启前置摄像头录制课程总结；前端会用 canvas 把视频压缩到最高 720p，显示生成文件体积，再通过后端代理初始化 R2 上传。上传成功返回的公开 URL 会自动写入表单状态；提交表单后，姓名、说明文字、`audioUrl`、`uploadId` 和视频信息会写入 Firebase Firestore。

## 本地运行

1. 安装依赖：
   ```bash
   npm install
   ```
2. 复制环境变量模板：
   ```bash
   cp .env.example .env.local
   ```
3. 配置服务端环境变量：
   ```bash
   VAD_UPLOAD_API_BASE="https://vad-video-upload-api.saintmob.workers.dev"
   VAD_UPLOAD_API_KEY="CHANGE_ME"
   MAX_REFLECTION_UPLOAD_BYTES="262144000"
   FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
   FIREBASE_REFLECTIONS_COLLECTION="courseReflections"
   FIREBASE_DATABASE_ID=""
   ```
4. 启动：
   ```bash
   npm run dev
   ```

播放界面：http://localhost:3000/

上传界面：http://localhost:3000/upload

摄像头和麦克风录制需要浏览器权限；除 `localhost` 外，部署地址必须使用 HTTPS。

## 部署说明

在 Vercel 项目里添加 `VAD_UPLOAD_API_BASE` 和 `VAD_UPLOAD_API_KEY`。浏览器先请求 `/api/uploads/init`，服务端带 API Key 向 Worker 申请 R2 预签名上传地址；浏览器再把压缩后的 WebM 直接 `PUT` 到该地址，完成后调用 `/api/uploads/complete` 确认上传。视频不会先经过 Vercel serverless 函数请求体，因此不会被 Vercel 4.5 MB 请求体限制拦住。

Firestore 写入使用 Firebase Admin SDK，因此还需要在部署环境中配置 `FIREBASE_SERVICE_ACCOUNT_JSON`。默认集合名是 `courseReflections`，可通过 `FIREBASE_REFLECTIONS_COLLECTION` 修改。

如果你的 Firestore 使用的不是默认 database，请同时配置 `FIREBASE_DATABASE_ID`。
