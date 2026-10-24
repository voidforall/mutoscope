import { useEffect, useMemo, useRef, useState } from "react";
import { buildDeepLink, captionAt, parseDeepLink, resolveDeepLink, totalDuration } from "../core";
import type { ReelBundle, ReelContext, Thread } from "../schema";
import { installApi } from "./api";
import { AskPanel } from "./components/AskPanel";
import { Controls } from "./components/Controls";
import { Icon } from "./components/Icon";
import { InspectPanel } from "./components/InspectPanel";
import { Presence } from "./components/Conversation";
import { ScenePanel } from "./components/ScenePanel";
import { Stage } from "./components/Stage";
import { ThreadsPanel } from "./components/ThreadsPanel";
import { readLiveConfig, useLiveSession } from "./live";
import type { PlayerState } from "./state";
import { applyTheme, storedTheme, systemTheme, type Theme } from "./theme";
import { useKeyboard } from "./useKeyboard";
import { VideoFrame } from "./VideoFrame";
import { usePlayer } from "./usePlayer";

type Tab = "scene" | "inspect" | "ask" | "threads";
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "scene", label: "Scene" },
  { id: "inspect", label: "Inspect" },
  { id: "ask", label: "Ask" },
  { id: "threads", label: "Threads" },
];

const isVideoMode = () => new URLSearchParams(window.location.search).get("mode") === "video";

function initialState(bundle: ReelBundle): PlayerState {
  const link = parseDeepLink(window.location.search);
  const r = resolveDeepLink(bundle.scenes, bundle.manifest.entrySceneId, link);
  const deep = link.sceneId !== undefined || link.entityId !== undefined;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  return { index: r.index, tMs: r.tMs, playing: !deep && !reduced && !isVideoMode(), selectedId: r.entityId, rate: 1 };
}

const TAB_KEY = "mutoscope:tab";
const TAB_IDS: readonly string[] = TABS.map((t) => t.id);

/** Survive a live reload on the same tab; storage may be unavailable, which only costs the convenience. */
function rememberTab(tab: Tab): void {
  try {
    sessionStorage.setItem(TAB_KEY, tab);
  } catch {
    // ignore
  }
}

function restoredTab(): Tab | undefined {
  try {
    const t = sessionStorage.getItem(TAB_KEY);
    sessionStorage.removeItem(TAB_KEY);
    return t && TAB_IDS.includes(t) ? (t as Tab) : undefined;
  } catch {
    return undefined;
  }
}

function baseUrl(bundle: ReelBundle): string {
  const here = window.location.href.split(/[?#]/)[0]!;
  return bundle.manifest.publicUrl ?? (here.startsWith("http") ? here : "https://localhost/");
}

export function App({ bundle }: { readonly bundle: ReelBundle }) {
  const { manifest, scenes } = bundle;
  const [state, dispatch] = usePlayer(scenes, useMemo(() => initialState(bundle), [bundle]));
  const [tab, setTab] = useState<Tab>(() => restoredTab() ?? (state.selectedId ? "inspect" : "scene"));
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());
  const [toast, setToast] = useState<string>();
  const stateRef = useRef(state);
  stateRef.current = state;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const liveConfig = useMemo(readLiveConfig, []);
  // The reel files changed on disk and still validate: reload in place, keeping the moment.
  const reloadHere = () => {
    const s = stateRef.current;
    const url = buildDeepLink(window.location.href, { sceneId: scenes[s.index]!.id, tMs: s.tMs, entityId: s.selectedId });
    window.history.replaceState(null, "", new URL(url).search);
    rememberTab(tabRef.current);
    window.location.reload();
  };
  const live = useLiveSession(liveConfig, reloadHere);
  const answers = live?.snapshot?.entries.filter((e) => e.role === "agent").length ?? 0;
  // Answers already in the session when the page loads count as seen.
  const [seenAnswers, setSeenAnswers] = useState<number>();
  const loaded = Boolean(live?.snapshot);

  const scene = scenes[state.index]!;
  const entity = scene.entities.find((e) => e.id === state.selectedId);
  const threads: readonly Thread[] = bundle.threads?.threads ?? [];
  const sceneThreads = threads.filter((t) => t.context.sceneId === scene.id);
  const threadCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of sceneThreads) if (t.context.entityId) counts.set(t.context.entityId, (counts.get(t.context.entityId) ?? 0) + 1);
    return counts;
  }, [sceneThreads]);

  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => installApi(scenes, () => stateRef.current, dispatch), [scenes, dispatch]);
  useKeyboard(state, dispatch);
  useEffect(() => {
    if (state.selectedId) setTab((t) => (t === "ask" ? t : "inspect"));
  }, [state.selectedId]);

  // Keep the address bar shareable without spamming history during playback.
  useEffect(() => {
    if (state.playing || isVideoMode()) return;
    const url = buildDeepLink(window.location.href.startsWith("http") ? window.location.href : "https://localhost/", {
      sceneId: scene.id,
      tMs: state.tMs,
      entityId: state.selectedId,
    });
    try {
      window.history.replaceState(null, "", new URL(url).search);
    } catch {
      // file:// or sandboxed iframes may refuse; deep links still work via Copy link.
    }
  }, [state.playing, state.index, state.selectedId, state.tMs, scene.id]);

  useEffect(() => {
    if (loaded && (tab === "ask" || seenAnswers === undefined)) setSeenAnswers(answers);
  }, [tab, answers, loaded, seenAnswers]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(undefined), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const copyLink = async () => {
    const url = buildDeepLink(baseUrl(bundle), { sceneId: scene.id, tMs: state.tMs, entityId: state.selectedId });
    try {
      await navigator.clipboard.writeText(url);
      setToast("Link to this moment copied");
    } catch {
      setToast("Could not access the clipboard");
    }
  };
  const jumpTo = (sceneId: string | undefined, tMs: number | undefined, entityId: string | undefined) => {
    const index = scenes.findIndex((s) => s.id === sceneId);
    if (index < 0) return;
    dispatch({ type: "pause" });
    dispatch({ type: "seek", index, tMs: tMs ?? 0 });
    if (entityId) dispatch({ type: "select", id: entityId });
  };
  const jumpToContext = (c: ReelContext) => jumpTo(c.sceneId, c.timestampMs, c.entityId);
  const jumpToThread = (t: Thread) => jumpToContext(t.context);
  const jumpToMoment = (href: string) => {
    const link = parseDeepLink(href);
    jumpTo(link.sceneId ?? scene.id, link.tMs ?? (link.sceneId ? 0 : state.tMs), link.entityId);
  };
  const source = manifest.source.provider === "none" ? undefined : manifest.source;
  const sourceHref = source?.repository ? `https://github.com/${source.repository}/tree/${source.headSha}` : undefined;
  const caption = captionAt(scene, state.tMs);

  if (isVideoMode()) return <VideoFrame bundle={bundle} state={state} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="title-block">
          <p className="kicker">
            <span className="brand" aria-hidden="true" />
            {manifest.kicker ?? manifest.recipe}
          </p>
          <h1 className="reel-title">{manifest.title}</h1>
          {manifest.subtitle && <p className="reel-subtitle">{manifest.subtitle}</p>}
        </div>
        <div className="top-actions">
          {live && (
            <button className="live-chip" onClick={() => setTab("ask")} title="Live session with your agent">
              <span className="live-chip-label">Live</span>
              <Presence live={live} />
            </button>
          )}
          {source && (
            <a className="sha-chip" href={sourceHref} target="_blank" rel="noopener noreferrer" title="Pinned source revision">
              {source.repository ? `${source.repository}@` : ""}
              {source.headSha.slice(0, 7)}
            </a>
          )}
          <button className="btn is-ghost" onClick={copyLink}>
            <Icon name="link" size={16} /> Copy link
          </button>
          <button className="icon-btn" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <Icon name={theme === "dark" ? "sun" : "moon"} />
          </button>
        </div>
      </header>
      <main className="layout">
        <section className="theater" aria-label="Reel player">
          {live?.invalid && (
            <p className="banner" role="alert">
              The reel files changed but no longer validate — still showing the last good version. {live.invalid}
            </p>
          )}
          <div className="stage-frame">
            <Stage scene={scene} tMs={state.tMs} selectedId={state.selectedId} threadCounts={threadCounts} onSelect={(id) => dispatch({ type: "select", id })} />
            {!state.playing && state.tMs === 0 && state.index === 0 && !state.selectedId && (
              <button className="big-play" aria-label="Play reel" onClick={() => dispatch({ type: "play" })}>
                <Icon name="play" size={34} />
              </button>
            )}
          </div>
          <div className="scene-tag">
            <span className="scene-tag-num">{String(state.index + 1).padStart(2, "0")}</span>
            {scene.kicker && <span className="scene-tag-kicker">{scene.kicker}</span>}
            <span className="scene-tag-title">{scene.title}</span>
          </div>
          <p className="caption" aria-live="polite">{caption}</p>
          <Controls scenes={scenes} state={state} dispatch={dispatch} />
          <p className="shortcuts">
            <kbd>Space</kbd> play/pause · <kbd>←</kbd><kbd>→</kbd> seek · <kbd>[</kbd><kbd>]</kbd> scenes · <kbd>Esc</kbd> deselect · {scenes.length} scenes, {Math.round(totalDuration(scenes) / 1000)}s
          </p>
        </section>
        <aside className="panel" aria-label="Details">
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? " is-on" : ""}`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === "threads" && sceneThreads.length > 0 && <span className="tab-count">{sceneThreads.length}</span>}
                {t.id === "inspect" && entity && <span className="tab-dot" />}
                {t.id === "ask" && tab !== "ask" && seenAnswers !== undefined && answers > seenAnswers && <span className="tab-dot" aria-label="New answer" />}
              </button>
            ))}
          </nav>
          {tab === "scene" && <ScenePanel manifest={manifest} scenes={scenes} index={state.index} onJump={(i) => dispatch({ type: "seek", index: i, tMs: 0 })} />}
          {tab === "inspect" && (
            <InspectPanel
              manifest={manifest}
              entity={entity}
              units={bundle.analysis?.units ?? []}
              threads={sceneThreads.filter((t) => t.context.entityId === entity?.id)}
              onAsk={() => setTab("ask")}
              onClear={() => dispatch({ type: "select", id: undefined })}
              onOpenThreads={() => setTab("threads")}
            />
          )}
          {tab === "ask" && (
            <AskPanel
              manifest={manifest}
              scenes={scenes}
              scene={scene}
              tMs={state.tMs}
              entity={entity}
              baseUrl={baseUrl(bundle)}
              live={live}
              onAsking={() => dispatch({ type: "pause" })}
              onJump={jumpToContext}
              onMoment={jumpToMoment}
            />
          )}
          {tab === "threads" && (
            <ThreadsPanel manifest={manifest} threads={threads} syncedAt={bundle.threads?.syncedAt} scenes={scenes} sceneId={scene.id} onJump={jumpToThread} />
          )}
        </aside>
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
