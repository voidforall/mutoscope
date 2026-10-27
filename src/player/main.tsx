import { createRoot } from "react-dom/client";
import { ReelBundle } from "../schema";
import { App } from "./App";
import "./fonts.css";
import "./styles.css";
import "./visuals.css";
import "./reel-styles.css";

export const DATA_ELEMENT_ID = "mutoscope-reel";

function fail(root: HTMLElement, message: string): void {
  const box = document.createElement("div");
  box.className = "fatal";
  const h = document.createElement("h1");
  h.textContent = "This reel could not be loaded";
  const p = document.createElement("p");
  p.textContent = message;
  box.append(h, p);
  root.replaceChildren(box);
}

function boot(): void {
  const root = document.getElementById("root");
  if (!root) return;
  const raw = document.getElementById(DATA_ELEMENT_ID)?.textContent;
  if (!raw) return fail(root, "No reel data was embedded in this page.");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(root, "The embedded reel data is not valid JSON.");
  }
  const parsed = ReelBundle.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(root, `Invalid reel: ${issue?.path.join(".")} — ${issue?.message}. Run \`mutoscope validate\`.`);
  }
  createRoot(root).render(<App bundle={parsed.data} />);
}

boot();
