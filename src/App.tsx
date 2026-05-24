import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { put } from '@vercel/blob/client';
import { Camera, CheckCircle2, Circle, Loader2, Play, Radio, RefreshCw, RotateCcw, Square, UploadCloud, UserRound, Waves } from 'lucide-react';

type Reflection = {
  id: string;
  name: string;
  audioUrl: string;
  mediaType: string;
  note: string;
  timestamp: string;
};

type UploadState = 'idle' | 'uploading' | 'uploaded' | 'error';
type SubmitState = 'idle' | 'submitting' | 'submitted' | 'error';
type RecordingState = 'idle' | 'camera-ready' | 'recording' | 'recorded' | 'error';

const initialForm = {
  name: '',
  note: '',
  audioUrl: '',
  mediaType: '',
};

function sanitizeUploadName(value: string) {
  const extension = value.includes('.') ? `.${value.split('.').pop()}` : '';
  const baseName = value
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${baseName || 'reflection'}${extension || '.bin'}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getRecorderMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.slice(0, 180));
  }
}

async function requestUploadToken(input: { pathname: string; contentType: string; size: number }) {
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readJsonResponse<{ clientToken?: string; error?: string }>(response);

  if (!response.ok || !payload.clientToken) {
    throw new Error(payload.error || '无法获取 Vercel Blob 上传令牌');
  }

  return payload.clientToken;
}

function getUploadErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '上传失败');
  if (message.includes('BLOB_READ_WRITE_TOKEN')) {
    return 'Vercel Blob token 未配置。请在 Vercel 环境变量里设置 BLOB_READ_WRITE_TOKEN。';
  }
  if (message.includes('not valid JSON') || message.includes('server error')) {
    return '上传接口返回了非 JSON 错误。请检查 Vercel 部署日志和 BLOB_READ_WRITE_TOKEN 配置。';
  }
  return message;
}

function App() {
  const isUploadPage = window.location.pathname.replace(/\/+$/, '') === '/upload';

  return (
    <main className="app">
      <AmbientStage />
      {isUploadPage ? <UploadPage /> : <PlaybackPage />}
    </main>
  );
}

function PlaybackPage() {
  const { reflections, latestReflection, isLoading, message, loadReflections } = useReflections();

  return (
    <>
      <section className="playback-hero page-fade">
        <div className="hero-copy">
          <div className="signal-pills" aria-hidden="true">
            <span>Course Reflection</span>
            <span>Playback Wall</span>
            <span>Firestore Archive</span>
          </div>
          <p className="eyebrow">FINAL REVIEW CHANNEL</p>
          <h1 className="glitch-title" data-text="回响">回响</h1>
          <p className="subtitle">播放学生的课程总结。每一段声音与影像都会在这里成为现场的一次回响。</p>
          <div className="loading-track" aria-hidden="true"><span /></div>
          <div className="hero-actions">
            <a className="primary-action" href="/upload">
              <UploadCloud />
              上传课程总结
            </a>
            <button className="ghost-action" type="button" onClick={() => void loadReflections()}>
              <RefreshCw />
              刷新播放列表
            </button>
          </div>
          {message && <p className="terminal-line"><i /> {message}</p>}
        </div>
      </section>

      <section className="archive-section playback-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PLAYBACK WALL</p>
            <h2>课程总结播放列表</h2>
          </div>
        </div>

        {latestReflection && (
          <article className="featured-player">
            <div>
              <p className="eyebrow">NOW PLAYING</p>
              <h3>{latestReflection.name}</h3>
              <p>{latestReflection.note || '这是一段来自课程现场的回响。'}</p>
            </div>
            <MediaPlayer reflection={latestReflection} featured />
          </article>
        )}

        <div className="reflection-grid">
          {isLoading && <p className="empty-state">正在同步播放列表...</p>}
          {!isLoading && reflections.length === 0 && <p className="empty-state">还没有课程总结。等待第一段回响上传。</p>}
          {reflections.map((reflection, index) => (
            <article className="reflection-card" key={reflection.id}>
              <div className="card-index">{String(index + 1).padStart(2, '0')}</div>
              <h3>{reflection.name}</h3>
              <p>{reflection.note || '未填写总结文字'}</p>
              <MediaPlayer reflection={reflection} />
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function UploadPage() {
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const sourceStreamRef = useRef<MediaStream | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const recordedUrlRef = useRef('');
  const [form, setForm] = useState(initialForm);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState('');
  const [recordedSize, setRecordedSize] = useState(0);
  const [message, setMessage] = useState('');
  const hasUpload = Boolean(form.audioUrl);

  useEffect(() => {
    return () => {
      stopCamera();
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    };
  }, []);

  function stopCamera() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    recorderRef.current?.state === 'recording' && recorderRef.current.stop();
    sourceStreamRef.current?.getTracks().forEach((track) => track.stop());
    canvasStreamRef.current?.getTracks().forEach((track) => track.stop());
    sourceStreamRef.current = null;
    canvasStreamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordingState('error');
      setMessage('当前浏览器不支持摄像头录制，请换用最新版 Chrome、Edge 或 Safari。');
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      sourceStreamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        await liveVideoRef.current.play();
      }
      setRecordingState('camera-ready');
      setMessage('前置摄像头已开启。');
    } catch {
      setRecordingState('error');
      setMessage('无法开启前置摄像头，请检查浏览器摄像头和麦克风权限。');
    }
  }

  function startRecording() {
    const sourceStream = sourceStreamRef.current;
    const sourceVideo = liveVideoRef.current;
    if (!sourceStream || !sourceVideo) {
      setMessage('请先开启前置摄像头。');
      return;
    }

    const sourceWidth = sourceVideo.videoWidth || 1280;
    const sourceHeight = sourceVideo.videoHeight || 720;
    const scale = Math.min(1280 / sourceWidth, 720 / sourceHeight, 1);
    const outputWidth = Math.max(2, Math.round((sourceWidth * scale) / 2) * 2);
    const outputHeight = Math.max(2, Math.round((sourceHeight * scale) / 2) * 2);
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setMessage('无法创建 720p 压缩画布。');
      return;
    }

    const drawFrame = () => {
      context.save();
      context.translate(outputWidth, 0);
      context.scale(-1, 1);
      context.drawImage(sourceVideo, 0, 0, outputWidth, outputHeight);
      context.restore();
      animationFrameRef.current = requestAnimationFrame(drawFrame);
    };
    drawFrame();

    const canvasStream = canvas.captureStream(30);
    sourceStream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
    canvasStreamRef.current = canvasStream;

    const mimeType = getRecorderMimeType();
    chunksRef.current = [];
    const recorder = new MediaRecorder(canvasStream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 1_800_000,
      audioBitsPerSecond: 96_000,
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      canvasStream.getTracks().forEach((track) => {
        if (track.kind === 'video') track.stop();
      });
      const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
      const url = URL.createObjectURL(blob);
      recordedUrlRef.current = url;
      setRecordedBlob(blob);
      setRecordedUrl(url);
      setRecordedSize(blob.size);
      setForm((current) => ({ ...current, audioUrl: '', mediaType: '' }));
      setUploadState('idle');
      setRecordingState('recorded');
      setMessage(`录制完成，已压缩到最高 720p，文件体积 ${formatFileSize(blob.size)}。`);
    };

    recorderRef.current = recorder;
    recorder.start(1000);
    setRecordedBlob(null);
    setRecordedSize(0);
    setRecordingState('recording');
    setUploadState('idle');
    setMessage('正在录制并压缩到 720p...');
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }

  function resetRecording() {
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    recordedUrlRef.current = '';
    setRecordedBlob(null);
    setRecordedUrl('');
    setRecordedSize(0);
    setForm((current) => ({ ...current, audioUrl: '', mediaType: '' }));
    setUploadState('idle');
    setSubmitState('idle');
    setRecordingState(sourceStreamRef.current ? 'camera-ready' : 'idle');
    setMessage(sourceStreamRef.current ? '可以重新录制。' : '');
  }

  async function uploadRecording() {
    if (!recordedBlob) {
      setMessage('请先完成录制。');
      return;
    }

    const fileName = `reflection-${Date.now()}.webm`;
    const pathname = `reflections/${sanitizeUploadName(fileName)}`;
    setUploadState('uploading');
    setSubmitState('idle');
    setMessage('正在申请 Vercel Blob 上传令牌...');

    try {
      const clientToken = await requestUploadToken({
        pathname,
        contentType: recordedBlob.type || 'video/webm',
        size: recordedBlob.size,
      });
      setMessage('正在上传到 Vercel Blob... 0%');

      const blob = await put(pathname, recordedBlob, {
        access: 'public',
        token: clientToken,
        contentType: recordedBlob.type || 'video/webm',
        multipart: true,
        onUploadProgress: ({ percentage }) => {
          setMessage(`正在上传到 Vercel Blob... ${Math.round(percentage)}%`);
        },
      });

      setForm((current) => ({
        ...current,
        audioUrl: blob.url,
        mediaType: recordedBlob.type || 'video/webm',
      }));
      setUploadState('uploaded');
      setMessage('上传成功，文件 URL 已写入表单状态。');
    } catch (error) {
      setUploadState('error');
      setForm((current) => ({ ...current, audioUrl: '', mediaType: '' }));
      setMessage(getUploadErrorMessage(error));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState('submitting');
    setMessage('正在保存到 Firestore...');

    try {
      const response = await fetch('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as { reflection?: Reflection; error?: string };
      if (!response.ok || !payload.reflection) throw new Error(payload.error || '保存失败');

      setForm(initialForm);
      resetRecording();
      setUploadState('idle');
      setSubmitState('submitted');
      setMessage('已保存。新的回响已经加入播放列表。');
    } catch (error) {
      setSubmitState('error');
      setMessage(error instanceof Error ? error.message : '保存失败');
    }
  }

  const statusText = useMemo(() => {
    if (recordingState === 'recording') return 'RECORDING 720P';
    if (recordingState === 'recorded') return 'RECORDING READY';
    if (uploadState === 'uploading') return 'UPLOADING TO BLOB';
    if (uploadState === 'uploaded') return 'BLOB URL READY';
    if (submitState === 'submitting') return 'WRITING FIRESTORE';
    if (submitState === 'submitted') return 'SAVED';
    return 'WAITING FOR CAMERA';
  }, [recordingState, submitState, uploadState]);

  return (
    <section className="upload-page page-fade">
      <div className="upload-intro">
        <div className="signal-pills" aria-hidden="true">
          <span>Submit</span>
          <span>Vercel Blob</span>
          <span>Firestore</span>
        </div>
        <p className="eyebrow">UPLOAD CHANNEL</p>
        <h1 className="glitch-title upload-title" data-text="上传">上传</h1>
        <p className="subtitle">打开前置摄像头录制课程总结。前端会压缩到最高 720p，显示文件体积后再上传。</p>
        <div className="hero-actions">
          <a className="ghost-action" href="/">返回播放界面</a>
        </div>
        <p className="terminal-line"><i /> {statusText}</p>
      </div>

      <form className="upload-console" onSubmit={handleSubmit}>
        <div className="console-heading">
          <div>
            <p className="eyebrow">SUBMIT A SIGNAL</p>
            <h2>录制课程总结</h2>
          </div>
          <UploadCloud aria-hidden="true" />
        </div>

        <label className="field-label" htmlFor="student-name">学生姓名</label>
        <div className="input-wrap">
          <UserRound aria-hidden="true" />
          <input
            id="student-name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="请输入姓名"
            required
          />
        </div>

        <label className="field-label" htmlFor="reflection-note">一句总结</label>
        <textarea
          id="reflection-note"
          value={form.note}
          onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
          placeholder="可以写下这段视频或音频想表达的内容"
          rows={3}
        />

        <div className="camera-recorder">
          <div className="camera-preview">
            {recordedUrl ? (
              <video ref={previewVideoRef} src={recordedUrl} controls playsInline />
            ) : (
              <>
                <video ref={liveVideoRef} autoPlay muted playsInline />
                {recordingState === 'idle' && <span>FRONT CAMERA</span>}
              </>
            )}
          </div>

          <div className="recording-meta">
            <span>输出：最高 1280 x 720</span>
            <span>格式：WebM</span>
            <span>体积：{recordedSize ? formatFileSize(recordedSize) : '等待录制'}</span>
          </div>

          <div className="recorder-actions">
            {recordingState === 'idle' || recordingState === 'error' ? (
              <button className="ghost-action" type="button" onClick={() => void startCamera()}>
                <Camera />
                开启前置摄像头
              </button>
            ) : null}
            {recordingState === 'camera-ready' ? (
              <button className="primary-action" type="button" onClick={startRecording}>
                <Circle />
                开始录制
              </button>
            ) : null}
            {recordingState === 'recording' ? (
              <button className="primary-action" type="button" onClick={stopRecording}>
                <Square />
                停止录制
              </button>
            ) : null}
            {recordingState === 'recorded' ? (
              <>
                <button className="ghost-action" type="button" onClick={resetRecording}>
                  <RotateCcw />
                  重新录制
                </button>
                <button className="primary-action" type="button" onClick={() => void uploadRecording()} disabled={uploadState === 'uploading'}>
                  {uploadState === 'uploading' ? <Loader2 className="spin" /> : <UploadCloud />}
                  上传录制视频
                </button>
              </>
            ) : null}
          </div>
        </div>

        <label className="field-label" htmlFor="audio-url">audioUrl</label>
        <input
          id="audio-url"
          className="url-field"
          value={form.audioUrl}
          onChange={(event) => setForm((current) => ({ ...current, audioUrl: event.target.value }))}
          placeholder="上传成功后自动填入"
          required
        />

        {message && <p className={`form-message ${uploadState === 'error' || submitState === 'error' ? 'is-error' : ''}`}>{message}</p>}

        <button className="primary-action" type="submit" disabled={!form.name.trim() || !hasUpload || submitState === 'submitting'}>
          {submitState === 'submitting' ? <Loader2 className="spin" /> : <CheckCircle2 />}
          保存到 Firestore
        </button>
      </form>
    </section>
  );
}

function useReflections() {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  async function loadReflections() {
    setIsLoading(true);
    try {
      const response = await fetch('/api/reflections');
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.status === 503) {
          setMessage('配置 Firebase Admin 后会显示已保存的课程总结。');
          setReflections([]);
          return;
        }
        throw new Error(payload.error || '无法读取课程总结');
      }
      const payload = (await response.json()) as { reflections?: Reflection[]; warning?: string };
      setReflections(payload.reflections ?? []);
      setMessage(payload.warning || '播放列表已同步');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法读取课程总结');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadReflections();
  }, []);

  return {
    reflections,
    latestReflection: reflections[0],
    isLoading,
    message,
    loadReflections,
  };
}

function MediaPlayer({ reflection, featured = false }: { reflection: Reflection; featured?: boolean }) {
  const isVideo = reflection.mediaType.startsWith('video/');

  return (
    <div className={featured ? 'media-shell featured' : 'media-shell'}>
      <div className="media-badge">
        {isVideo ? <Play /> : <Waves />}
        {isVideo ? 'VIDEO' : 'AUDIO'}
      </div>
      {isVideo ? (
        <video src={reflection.audioUrl} controls playsInline />
      ) : (
        <audio src={reflection.audioUrl} controls />
      )}
    </div>
  );
}

function AmbientStage() {
  const traceLines = [
    'M-30 590 C130 510 120 360 250 310 C380 200 505 250 665 470 C830 350 900 330 980 310',
    'M40 720 C190 620 285 705 382 585 C510 425 610 690 790 520 C850 475 890 450 930 430',
    'M120 85 C260 170 185 300 330 330 475 380 430 505 610 535 735 566 750 430 960 365',
    'M-20 250 C110 205 180 160 255 220 340 295 455 110 555 180 675 252 720 120 920 92',
    'M25 430 L160 515 L285 475 L390 610 L520 565 L670 730 L830 690 L985 780',
  ];

  return (
    <div className="ambient-stage" aria-hidden="true">
      <div className="deep-field" />
      <div className="signal-dust" />
      <svg className="constellation-map" viewBox="0 0 1000 860" preserveAspectRatio="none">
        {traceLines.map((line, index) => (
          <path className="trace-line" d={line} key={line} style={{ '--i': index } as CSSProperties} />
        ))}
        {Array.from({ length: 34 }).map((_, index) => (
          <circle
            className="trace-node"
            cx={(index * 89 + 42) % 1000}
            cy={(index * 137 + 64) % 860}
            key={index}
            r={(index % 4) + 1.2}
            style={{ '--delay': `${(index % 8) * 0.31}s` } as CSSProperties}
          />
        ))}
      </svg>
      <div className="wave wave-a" />
      <div className="wave wave-b" />
      <div className="grid-noise" />
      {Array.from({ length: 80 }).map((_, index) => (
        <span
          className="particle"
          key={index}
          style={{
            '--x': `${(index * 47 + 11) % 100}%`,
            '--y': `${(index * 61 + 7) % 100}%`,
            '--delay': `${(index % 13) * 0.28}s`,
            '--size': `${2 + (index % 4)}px`,
          } as CSSProperties}
        />
      ))}
      <Radio className="corner-glyph" />
    </div>
  );
}

export default App;
