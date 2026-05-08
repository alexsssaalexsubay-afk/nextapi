const SIDECAR_BASE = "http://localhost:8765";
const MAX_RETRIES = 3;
const BASE_DELAY = 800;
const REQUEST_TIMEOUT = 30_000;
const HEALTH_TIMEOUT = 3_000;
const WS_HEARTBEAT_INTERVAL = 15_000;
const WS_RECONNECT_BASE = 1_000;
const WS_RECONNECT_MAX = 30_000;

export async function sidecarFetch<T>(
  path: string,
  init?: RequestInit,
  retries = MAX_RETRIES
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${SIDECAR_BASE}${path}`, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            "X-NextCut-Client": "nextcut-renderer",
            ...init?.headers,
          },
          signal: init?.signal || controller.signal,
        });

        if (!res.ok) {
          if (res.status >= 500 && attempt < retries) {
            await sleep(BASE_DELAY * Math.pow(2, attempt));
            continue;
          }
          const body = await res.text().catch(() => "");
          throw new SidecarError(res.status, body || res.statusText, path);
        }

        return await res.json();
      } catch (err) {
        if (err instanceof SidecarError) throw err;
        if (attempt < retries && isRetryable(err)) {
          await sleep(BASE_DELAY * Math.pow(2, attempt));
          continue;
        }
        throw err;
      }
    }
    throw new SidecarError(0, "Max retries exceeded", path);
  } finally {
    clearTimeout(timeout);
  }
}

export class SidecarError extends Error {
  constructor(
    public status: number,
    public body: string,
    public path: string
  ) {
    super(`Sidecar error ${status} on ${path}`);
    this.name = "SidecarError";
  }
}

export function createReconnectingWs(
  path: string,
  onMessage: (data: unknown) => void,
  onStatusChange?: (connected: boolean) => void
): { close: () => void } {
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout>;
  let heartbeatTimer: ReturnType<typeof setInterval>;
  let reconnectDelay = WS_RECONNECT_BASE;

  function connect() {
    if (closed) return;
    try {
      ws = new WebSocket(`ws://localhost:8765${path}`);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      reconnectDelay = WS_RECONNECT_BASE;
      onStatusChange?.(true);
      startHeartbeat();
    };

    ws.onmessage = (ev) => {
      if (ev.data === "pong") return;
      try {
        onMessage(JSON.parse(ev.data));
      } catch {
        onMessage(ev.data);
      }
    };

    ws.onclose = () => {
      stopHeartbeat();
      onStatusChange?.(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, WS_HEARTBEAT_INTERVAL);
  }

  function stopHeartbeat() {
    clearInterval(heartbeatTimer);
  }

  function scheduleReconnect() {
    if (closed) return;
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 1.5, WS_RECONNECT_MAX);
      connect();
    }, reconnectDelay);
  }

  connect();

  return {
    close: () => {
      closed = true;
      clearTimeout(reconnectTimer);
      stopHeartbeat();
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close();
      }
    },
  };
}

export async function checkHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);
    const res = await fetch(`${SIDECAR_BASE}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export async function waitForSidecar(timeoutMs = 20_000): Promise<boolean> {
  const start = Date.now();
  let delay = 300;
  while (Date.now() - start < timeoutMs) {
    if (await checkHealth()) return true;
    await sleep(delay);
    delay = Math.min(delay * 1.3, 2000);
  }
  return false;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false;
  if (err instanceof TypeError) return true;
  return true;
}
