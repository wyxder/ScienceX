/* ============================================================
   ScienceX 前端 API 客户端 —— 严格遵循 TSD §5.1 / §5.2 / §5.4 规范
   支持：类型泛型、静默 Token 续期、SSE 容错解析、断线断点重连、Abort 中断与 401 路由广播
   ============================================================ */

import type {
  ChatCompletionPayload,
  ChatMessage,
  DocChatMessage,
  PlanFlowData,
  SSEDonePayload,
  SSEErrorPayload,
  SSEProgressPayload,
  SSEReferencePayload,
  SSEStartPayload,
  SSEStepPayload,
  SSEToolPayload,
  ThoughtStep,
} from '../types';

const BASE = import.meta.env.VITE_API_BASE || '/api/v1';

export class ApiError extends Error {
  code: number;
  trace_id?: string;
  constructor(code: number, message: string, trace_id?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.trace_id = trace_id;
  }
}

/* ---------- Token 状态安全管理 (优先 sessionStorage + 内存缓存，隔离跨标签风险) ---------- */
let memoryToken = '';
let memoryRefreshToken = '';

export function getToken(): string {
  if (memoryToken) return memoryToken;
  try {
    const s = sessionStorage.getItem('sx_token') || '';
    memoryToken = s;
    return s;
  } catch {
    return memoryToken;
  }
}

export function getRefreshToken(): string {
  if (memoryRefreshToken) return memoryRefreshToken;
  try {
    const s = sessionStorage.getItem('sx_refresh_token') || '';
    memoryRefreshToken = s;
    return s;
  } catch {
    return memoryRefreshToken;
  }
}

export function setToken(token: string, refreshToken?: string): void {
  memoryToken = token;
  try {
    sessionStorage.setItem('sx_token', token);
    if (refreshToken) {
      memoryRefreshToken = refreshToken;
      sessionStorage.setItem('sx_refresh_token', refreshToken);
    }
  } catch (_) {}
}

export function clearToken(): void {
  memoryToken = '';
  memoryRefreshToken = '';
  try {
    sessionStorage.removeItem('sx_token');
    sessionStorage.removeItem('sx_refresh_token');
  } catch (_) {}
}

/* ---------- 401 认证拦截与静默 Token 续期 (F3 & F4) ---------- */
let isRefreshing = false;
let refreshSubscribers: Array<(newToken: string | null) => void> = [];

function onTokenRefreshed(newToken: string | null) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

async function attemptTokenRefresh(): Promise<string | null> {
  const rf = getRefreshToken();
  if (!rf) return null;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rf }),
    });
    const json = await res.json();
    if (json.code === 0 && json.data?.token) {
      setToken(json.data.token, json.data.refresh_token);
      return json.data.token;
    }
  } catch (_) {}
  return null;
}

async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing) {
    return new Promise((resolve) => refreshSubscribers.push(resolve));
  }

  isRefreshing = true;
  try {
    const newToken = await attemptTokenRefresh();
    onTokenRefreshed(newToken);
    return newToken;
  } finally {
    isRefreshing = false;
  }
}

// Streaming endpoints use fetch directly, so they need the same one-shot
// refresh behavior as api() instead of failing immediately on an expired token.
async function fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status !== 401 || init.signal?.aborted) return response;
  if (!getRefreshToken()) {
    handleAuthExpired();
    return response;
  }

  await response.body?.cancel().catch(() => undefined);
  const newToken = await refreshAccessToken();
  if (!newToken) {
    handleAuthExpired();
    return response;
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${newToken}`);
  const retryResponse = await fetch(url, { ...init, headers });
  if (retryResponse.status === 401 && !init.signal?.aborted) {
    handleAuthExpired();
  }
  return retryResponse;
}

function handleAuthExpired() {
  clearToken();
  // 广播 401 事件给 React 应用，支持平滑展示 Toast 与带参重定向
  window.dispatchEvent(
    new CustomEvent('sx:auth-expired', {
      detail: { redirect: window.location.hash.replace(/^#/, '') || '/' },
    })
  );
}

/* ---------- 核心 API 请求方法 (F2 强类型泛型) ---------- */
export interface RequestOptions {
  method?: string;
  body?: any;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  isRetry?: boolean;
}

export async function api<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params, signal, headers = {}, isRetry = false } = opts;
  let url = BASE + path;

  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += `?${qs}`;
  }

  const token = getToken();
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    throw new ApiError(50003, `网络请求失败: ${err?.message || '无法连接至服务器'}`);
  }

  // 先读取原始文本，避免非 JSON 响应（500/502/空响应体）直接触发 JSON 语法异常
  let rawText = '';
  try {
    rawText = await res.text();
  } catch (err: any) {
    throw new ApiError(50001, `读取服务响应失败: ${err?.message || '连接异常中断'}`);
  }

  let json: any = null;
  if (rawText) {
    try {
      json = JSON.parse(rawText);
    } catch (_) {
      // 非 JSON 格式，保留 rawText 进行下文针对性报错
    }
  }

  // 1. 若成功解析为业务标准 JSON 封装
  if (json && typeof json === 'object') {
    // 401 拦截处理与静默续期
    if (json.code === 40101 || res.status === 401) {
      if (!isRetry && getRefreshToken()) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          return api<T>(path, { ...opts, isRetry: true });
        }
      }

      handleAuthExpired();
      throw new ApiError(json.code || 40101, json.message || '登录凭据无效，请重新登录', json.trace_id);
    }

    if (json.code !== undefined && json.code !== 0) {
      throw new ApiError(json.code, json.message || '请求失败', json.trace_id);
    }

    return (json.data !== undefined ? json.data : json) as T;
  }

  // 2. 非有效 JSON 响应：结合 HTTP 状态码提供清晰可读的错误提示
  if (res.status === 401) {
    if (!isRetry && getRefreshToken()) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return api<T>(path, { ...opts, isRetry: true });
      }
    }
    handleAuthExpired();
    throw new ApiError(40101, '登录凭据已过期，请重新登录');
  }

  if (!res.ok) {
    let snippet = rawText.trim();
    if (snippet.length > 200 || snippet.startsWith('<') || snippet.includes('<!DOCTYPE')) {
      snippet = '';
    }

    if (res.status === 502 || res.status === 503) {
      throw new ApiError(50002, snippet || `后端服务未启动或连接异常 (HTTP ${res.status})`);
    }
    if (res.status === 504) {
      throw new ApiError(50004, snippet || '后端网关响应超时 (HTTP 504)');
    }
    if (res.status === 500) {
      throw new ApiError(50001, snippet || '后端服务内部错误 (HTTP 500)');
    }
    if (res.status === 404) {
      throw new ApiError(40003, snippet || `请求的接口不存在: ${path} (HTTP 404)`);
    }
    throw new ApiError(res.status * 100, snippet || `请求异常 (HTTP ${res.status}: ${res.statusText || 'Error'})`);
  }

  // 200 OK 且返回空内容
  if (!rawText.trim()) {
    return {} as T;
  }

  throw new ApiError(50001, '响应内容格式错误，非有效 JSON 格式');
}

/* ---------- SSE 流式事件定义 (TSD §5.4 标准协议，载荷类型见 types/index.ts F2 判别联合) ---------- */
export interface SSEHandlers {
  onStart?: (d: SSEStartPayload) => void;
  onDelta?: (text: string) => void;
  /** progress 载荷：DreamPaper 流水线额外携带 design_log（Design Log 流式增量）与 diagnosis（故障诊断卡） */
  onProgress?: (d: SSEProgressPayload) => void;
  onReference?: (d: SSEReferencePayload) => void;
  onTool?: (d: SSEToolPayload) => void;
  onDone?: (d: SSEDonePayload) => void;
  onError?: (msg: string, details?: SSEErrorPayload) => void;
  onFallback?: (details: SSEErrorPayload) => void;
  /* LingXiAgent 多智能体扩展事件 */
  onPlan?: (data: PlanFlowData) => void;
  onStepStart?: (data: SSEStepPayload) => void;
  onStepUpdate?: (data: SSEStepPayload) => void;
  onThought?: (data: ThoughtStep) => void;
  onToolCall?: (data: SSEToolPayload) => void;
  onToolResult?: (data: SSEToolPayload) => void;
  onMemoryInjected?: (data: NonNullable<ChatMessage['memory_injected']>) => void;
  /** 多智能体评审团：单个角色 Agent 的实时状态事件（running / done / fallback） */
  onAgent?: (data: { agent: string; role: string; status: string; score?: number; comments?: string }) => void;
}

/* ---------- SSE：对话流式 (支持 AbortSignal 中断与 Last-Event-ID 记录) ---------- */
// 每条流单独保存游标，避免对话流的事件序号污染文献问答或任务流。
const lastReceivedEventIds = new Map<string, string>();

export async function chatStream(payload: ChatCompletionPayload, handlers: SSEHandlers, signal?: AbortSignal): Promise<void> {
  const token = getToken();
  const streamKey = `chat:${payload?.conversation_id || 'default'}`;
  try {
    const res = await fetchWithAuth(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(lastReceivedEventIds.get(streamKey) ? { 'Last-Event-ID': lastReceivedEventIds.get(streamKey)! } : {}),
      },
      body: JSON.stringify({ ...payload, stream: true }),
      signal,
    });

    if (!res.ok || !res.body) {
      handlers.onError?.(`服务响应错误 [${res.status}]，请稍后重试`);
      return;
    }

    await readSSE(res.body, handlers, streamKey);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      handlers.onDone?.({ aborted: true, text: '用户已终止生成' });
      return;
    }
    handlers.onError?.(err?.message || '网络连接异常');
  }
}

export async function docChatStream(docId: string, messages: DocChatMessage[], handlers: SSEHandlers, signal?: AbortSignal): Promise<void> {
  const token = getToken();
  try {
    const res = await fetchWithAuth(`${BASE}/documents/${docId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(lastReceivedEventIds.get(`doc:${docId}`) ? { 'Last-Event-ID': lastReceivedEventIds.get(`doc:${docId}`)! } : {}),
      },
      body: JSON.stringify({ messages }),
      signal,
    });

    if (!res.ok || !res.body) {
      handlers.onError?.(`文献问答服务错误 [${res.status}]`);
      return;
    }

    await readSSE(res.body, handlers, `doc:${docId}`);
  } catch (err: any) {
    if (err.name === 'AbortError') return;
    handlers.onError?.(err?.message || '文献问答连接失败');
  }
}

/* ---------- SSE：异步任务进度（修复 🐞2 / B11：采用 fetch + ReadableStream 携带 Authorization） ---------- */
export function taskStream(taskId: string, handlers: SSEHandlers): () => void {
  const controller = new AbortController();
  let stopped = false;
  let terminal = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryResolve: (() => void) | undefined;
  let attempts = 0;

  (async () => {
    while (!stopped && !controller.signal.aborted) {
      try {
        const token = getToken();
        const res = await fetchWithAuth(`${BASE}/tasks/${taskId}/stream`, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(lastReceivedEventIds.get(`task:${taskId}`) ? { 'Last-Event-ID': lastReceivedEventIds.get(`task:${taskId}`)! } : {}),
          },
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          // 任务流短暂断开时重连；认证失败交给统一 API 事件处理，避免死循环。
          if (res.status >= 500 || res.status === 408 || res.status === 429) {
            throw new Error(`任务流响应错误 [${res.status}]`);
          }
          handlers.onError?.(`无法建立任务进度监听 [${res.status}]`);
          return;
        }

        await readSSE(res.body, {
          onProgress: (d) => handlers.onProgress?.(d),
          onAgent: (d) => handlers.onAgent?.(d),
          onDone: (d) => {
            stopped = true;
            handlers.onDone?.(d);
          },
          onError: (err) => {
            stopped = true;
            terminal = true;
            handlers.onError?.(err);
          },
        }, `task:${taskId}`);

        // 服务端正常结束通常会先发 done；没有 done 时视为可恢复断开。
        if (stopped || terminal || controller.signal.aborted) return;
        throw new Error('任务流已断开');
      } catch (err: any) {
        if (err.name === 'AbortError' || stopped || terminal || controller.signal.aborted) return;
        if (attempts >= 3) {
          handlers.onError?.('任务进度监控连接中断，请刷新页面重试');
          return;
        }
        const delay = 500 * 2 ** attempts;
        attempts += 1;
        await new Promise<void>((resolve) => {
          retryResolve = resolve;
          retryTimer = setTimeout(() => {
            retryTimer = undefined;
            retryResolve = undefined;
            resolve();
          }, delay);
        });
      }
    }
  })();

  return () => {
    stopped = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
    retryResolve?.();
    retryResolve = undefined;
    controller.abort();
  };
}

/* ---------- 文献上传：三段式真实进度（本地读取 → 网络上传 → 服务端版面解析） ----------
   后端 /documents/upload 采用 JSON + Base64 提交，故用 XMLHttpRequest.upload.onprogress
   取真实字节进度；解析阶段服务端为同步耗时，以时间衰减缓动逼近 99%，响应返回后置 100%。 */
export type UploadStage = 'reading' | 'uploading' | 'parsing' | 'done';
export interface UploadProgress {
  stage: UploadStage;
  percent: number;
  fileName: string;
}
export interface UploadHandle {
  promise: Promise<any>;
  abort: () => void;
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 与后端 upload.MAX_FILE_BYTES 对齐

function readFileAsBase64(file: File, onFraction: (f: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) onFraction(e.loaded / (e.total || file.size));
    };
    reader.onerror = () => reject(new ApiError(40012, `读取本地文件失败：${reader.error?.message || '未知错误'}`));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      if (comma < 0) reject(new ApiError(40012, '文件编码失败'));
      else resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function uploadDocument(file: File, opts: { onProgress: (p: UploadProgress) => void; projectId?: string }): UploadHandle {
  const { onProgress, projectId = 'p1' } = opts;
  let xhr: XMLHttpRequest | null = null;
  let decayTimer: ReturnType<typeof setInterval> | null = null;
  let aborted = false;
  let percent = 0;

  const emit = (stage: UploadStage, target: number, force?: boolean) => {
    // 衰减缓动：解析等无字节反馈阶段逐步逼近上限，避免出现「卡住不动」的假死观感
    percent = force ? target : Math.max(percent, Math.min(target, percent + (target - percent) * 0.35));
    onProgress({ stage, percent: Math.round(percent), fileName: file.name });
  };

  const startParseDecay = () => {
    emit('parsing', 78, true);
    percent = 78;
    decayTimer = setInterval(() => {
      if (aborted) return;
      percent = Math.min(97, percent + Math.max(0.4, (97 - percent) * 0.05));
      onProgress({ stage: 'parsing', percent: Math.round(percent), fileName: file.name });
    }, 260);
  };

  const stopTimers = () => {
    if (decayTimer) clearInterval(decayTimer);
    decayTimer = null;
  };

  const promise = (async () => {
    if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(40011, '单文件不能超过 50MB');
    emit('reading', 1, true);
    const base64 = await readFileAsBase64(file, (f) => emit('reading', 1 + 24 * f));
    if (aborted) throw Object.assign(new Error('已取消上传'), { name: 'AbortError' });
    const bodyOf = (token: string) => new Promise<any>((resolve, reject) => {
        const req = new XMLHttpRequest();
        xhr = req;
        req.open('POST', `${BASE}/documents/upload`);
        req.setRequestHeader('Content-Type', 'application/json');
        if (token) req.setRequestHeader('Authorization', `Bearer ${token}`);
        req.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const ratio = e.loaded / (e.total || 1);
          if (ratio >= 1) startParseDecay();
          else emit('uploading', 25 + 50 * ratio, true);
        };
        req.onerror = () => reject(new ApiError(50003, '上传连接异常，请检查后端服务是否在运行'));
        req.onabort = () => reject(Object.assign(new Error('已取消上传'), { name: 'AbortError' }));
        req.onload = () => {
          stopTimers();
          let json: any = null;
          try {
            json = JSON.parse(req.responseText);
          } catch {
            reject(new ApiError(50001, `解析响应失败 (HTTP ${req.status})`));
            return;
          }
          if (req.status === 401) {
            reject(Object.assign(new Error('unauthorized'), { name: 'UnauthorizedError' }));
            return;
          }
          if (!json || json.code !== 0) {
            reject(new ApiError(json?.code || req.status * 100, json?.message || `上传失败 (HTTP ${req.status})`));
            return;
          }
          emit('done', 100, true);
          resolve(json.data);
        };
        req.send(JSON.stringify({ file_name: file.name, file_content: base64, mime: file.type || '', project_id: projectId }));
      });
    try {
      return await bodyOf(getToken());
    } catch (err: any) {
      if (err?.name === 'UnauthorizedError' && getRefreshToken()) {
        const newToken = await refreshAccessToken();
        if (newToken) return bodyOf(newToken);
        handleAuthExpired();
      }
      throw err;
    } finally {
      stopTimers();
    }
  })();

  return {
    promise,
    abort: () => {
      aborted = true;
      stopTimers();
      xhr?.abort();
    },
  };
}

/* ---------- 通用 SSE 缓冲区解析器（带 Last-Event-ID 记录与 JSON 容错） ---------- */
async function readSSE(stream: ReadableStream<Uint8Array>, handlers: SSEHandlers, streamKey: string): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';

  const dispatch = (event: string, dataStr: string, eventId?: string) => {
    if (eventId) lastReceivedEventIds.set(streamKey, eventId);
    if (!dataStr) return;

    let data: any;
    try {
      data = JSON.parse(dataStr);
    } catch {
      // 容错：当非 JSON 结构时作为纯文本传递
      data = { text: dataStr, message: dataStr };
    }

    switch (event) {
      case 'start':
        handlers.onStart?.(data);
        break;
      case 'delta':
        handlers.onDelta?.(data.text !== undefined ? data.text : String(data));
        break;
      case 'progress':
        handlers.onProgress?.(data);
        break;
      case 'reference':
        handlers.onReference?.(data);
        break;
      case 'tool':
        handlers.onTool?.(data);
        break;
      case 'plan':
        handlers.onPlan?.(data);
        break;
      case 'step_start':
        handlers.onStepStart?.(data);
        break;
      case 'step_update':
        handlers.onStepUpdate?.(data);
        break;
      case 'thought':
        handlers.onThought?.(data);
        break;
      case 'tool_call':
        handlers.onToolCall?.(data);
        break;
      case 'tool_result':
        handlers.onToolResult?.(data);
        break;
      case 'memory_injected':
        handlers.onMemoryInjected?.(data);
        break;
      case 'agent':
        handlers.onAgent?.(data);
        break;
      case 'fallback':
        handlers.onFallback?.(data);
        break;
      case 'error':
        handlers.onError?.(data.message || '模型生成遇到异常', data);
        break;
      case 'done':
        handlers.onDone?.(data);
        break;
      default:
        if (data.text) handlers.onDelta?.(data.text);
        break;
    }
  };

  const processBlock = (block: string) => {
    if (!block.trim()) return;
    let event = 'message';
    let eventId = '';
    const dataLines: string[] = [];

    for (const line of block.split('\n')) {
      if (line.startsWith(':')) {
        // 心跳注释行 : ping
        continue;
      } else if (line.startsWith('id:')) {
        eventId = line.slice(3).trim();
      } else if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5));
      }
    }

    dispatch(event, dataLines.join('\n').trim(), eventId);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush TextDecoder and process a final event without a trailing blank line.
        buf += decoder.decode();
        if (buf.trim()) processBlock(buf);
        break;
      }

      buf += decoder.decode(value, { stream: true });
      const blocks = buf.split('\n\n');
      buf = blocks.pop() || '';

      blocks.forEach(processBlock);
    }
  } finally {
    reader.releaseLock();
  }
}
