import { createElement } from "react";
import type { IconName } from "../../schema";
import { LUCIDE } from "./lucide";

/** A bundled Lucide icon, drawn from shape data (never from markup), in the current text colour. */
export function LucideIcon({ name, size, strokeWidth = 2, className }: { readonly name: IconName; readonly size: number; readonly strokeWidth?: number; readonly className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {LUCIDE[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
