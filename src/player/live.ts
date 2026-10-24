import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE_ELEMENT_ID, LiveConfig, LiveEvent, type LiveSnapshot, type ReelContext } from "../schema";

/** Present only on pages served by `mutoscope watch`; built and published reels never have it. */
export function readLiveConfig(): LiveConfig | undefined {
  const raw = document.getElementById(LIVE_ELEMENT_ID)?.textContent;
  if (!raw) return undefined;
  try {
    const parsed = LiveConfig.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export interface LiveSession {
  readonly snapshot?: LiveSnapshot;
  /** The event stream to the local server is open. */
  readonly connected: boolean;
  /** Validation error after the reel files changed on disk; the page keeps the last good version. */
  readonly invalid?: string;
  ask(text: string, context: ReelContext): Promise<void>;
  end(): Promise<void>;
}

async function post(config: LiveConfig, path: string, body: unknown): Promise<void> {
  const res = await fetch(`/s/${config.sessionId}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mutoscope-token": config.token },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const message = await res.json().then((b: { error?: string }) => b.error, () => undefined);
    throw new Error(message ?? `The live session answered ${res.status}`);
  }
}

/** Subscribe to the session's event stream; `onReload` runs when the reel files changed and validate cleanly. */
export function useLiveSession(config: LiveConfig | undefined, onReload: () => void): LiveSession | undefined {
  const [snapshot, setSnapshot] = useState<LiveSnapshot>();
  const [connected, setConnected] = useState(false);
  const [invalid, setInvalid] = useState<string>();
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;

  useEffect(() => {
    if (!config) return;
    const es = new EventSource(`/s/${config.sessionId}/events?token=${config.token}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      let event;
      try {
        event = LiveEvent.safeParse(JSON.parse(m.data as string));
      } catch {
        return;
      }
      if (!event.success) return;
      if (event.data.type === "state") setSnapshot(event.data.state);
      else if (event.data.type === "invalid") setInvalid(event.data.message);
      else reloadRef.current();
    };
    return () => es.close();
  }, [config]);

  const ask = useCallback((text: string, context: ReelContext) => post(config!, "ask", { text, context }), [config]);
  const end = useCallback(() => post(config!, "end", {}), [config]);
  return config ? { snapshot, connected, invalid, ask, end } : undefined;
}
