"use client";

import { useEffect, useState } from "react";
import { rankOf, suitOf, type Card } from "@/core/cards";

const SUIT_SYMBOL: Record<string, string> = { c: "♣", d: "♦", h: "♥", s: "♠" };
// Four-color deck as solid card backgrounds with white pips:
// spades black, hearts red, diamonds blue, clubs green.
const SUIT_BG: Record<string, string> = {
  s: "bg-neutral-900",
  h: "bg-red-600",
  d: "bg-blue-600",
  c: "bg-emerald-600",
};
const SUIT_HEX: Record<string, string> = {
  s: "#171717",
  h: "#dc2626",
  d: "#2563eb",
  c: "#059669",
};

const SIZES = {
  xs: "h-10 w-7 text-[11px] rounded-md",
  sm: "h-12 w-9 text-sm rounded-md",
  md: "h-[4.5rem] w-[3.25rem] text-base rounded-lg",
  lg: "h-24 w-[4.5rem] text-xl rounded-lg",
  /** Fills parent — use inside a sized flex/grid cell. */
  fill: "h-full w-full text-[clamp(0.7rem,0.55em+0.4vw,1.15rem)] rounded-[0.4rem]",
} as const;

/**
 * A playing card that flips in 3D between face-down and face-up.
 *
 * - `faceDown` controls the target state; changing it animates a flip.
 * - `dealDelayMs` makes a face-up card *deal in* — it mounts face-down and
 *   flips up after the delay (use a per-index stagger for a nice dealing wave).
 * - Draggable cards use a flat custom drag image so the 3D faces don't spawn a
 *   broken translucent "ghost" overlay that steals the drag.
 */
export function FlipCard({
  card,
  faceDown = false,
  size = "md",
  dealDelayMs,
  selected = false,
  dimmed = false,
  onClick,
  draggable = false,
  onDragStart,
  onDragEnd,
}: {
  card?: Card | null;
  faceDown?: boolean;
  size?: keyof typeof SIZES;
  dealDelayMs?: number;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}) {
  const wantsDealIn = dealDelayMs != null && !faceDown && !!card;
  const [down, setDown] = useState<boolean>(faceDown || wantsDealIn);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (wantsDealIn) {
      const t = setTimeout(() => setDown(false), dealDelayMs);
      return () => clearTimeout(t);
    }
    setDown(faceDown);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceDown, card]);

  const rank = card ? rankOf(card) : null;
  const suit = card ? suitOf(card) : null;
  const bgClass = suit ? SUIT_BG[suit] ?? "bg-neutral-900" : "bg-neutral-900";
  const rankLabel = rank === "T" ? "10" : rank;

  const interactive = Boolean(onClick) && !faceDown && !!card;
  const canDrag = draggable && !!card && !faceDown;

  function handleDragStart(e: React.DragEvent) {
    if (!card || !suit || !rank) return;
    setDragging(true);
    e.dataTransfer.setData("text/plain", card);
    e.dataTransfer.effectAllowed = "move";

    // Flat preview — 3D transform clones produce a translucent ghost overlay
    // that can sit over the table and intercept the drag.
    const preview = document.createElement("div");
    preview.style.cssText = [
      "width:52px",
      "height:72px",
      "border-radius:8px",
      `background:${SUIT_HEX[suit] ?? "#171717"}`,
      "color:#fff",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "font-weight:900",
      "font-family:ui-sans-serif,system-ui,sans-serif",
      "box-shadow:0 8px 20px rgba(0,0,0,0.45)",
      "position:absolute",
      "top:-9999px",
      "left:-9999px",
      "pointer-events:none",
      "z-index:99999",
    ].join(";");
    preview.innerHTML = `<div style="font-size:22px;line-height:1">${rankLabel}</div><div style="font-size:16px;line-height:1;margin-top:2px">${SUIT_SYMBOL[suit]}</div>`;
    document.body.appendChild(preview);
    e.dataTransfer.setDragImage(preview, 26, 36);
    // Remove after the browser has snapshot the node.
    requestAnimationFrame(() => preview.remove());

    onDragStart?.(e);
  }

  return (
    <div
      className={`flip ${SIZES[size]} ${selected ? (size === "fill" || size === "xs" || size === "sm" ? "-translate-y-1" : "-translate-y-2") : ""} transition-transform ${
        interactive ? "cursor-pointer hover:-translate-y-0.5" : ""
      } ${canDrag ? "cursor-grab active:cursor-grabbing" : ""} ${dragging ? "opacity-30" : ""}`}
      onClick={interactive ? onClick : undefined}
      draggable={canDrag}
      onDragStart={handleDragStart}
      onDragEnd={(e) => {
        setDragging(false);
        onDragEnd?.(e);
      }}
      role={interactive || canDrag ? "button" : undefined}
      aria-label={card && !faceDown ? `${rank}${SUIT_SYMBOL[suit!]}` : "Card"}
      // Prevent the browser from using the live 3D layer as the drag bitmap.
      style={canDrag ? ({ WebkitUserDrag: "element" } as React.CSSProperties) : undefined}
    >
      <div
        className={`flip-inner ${down ? "is-down" : ""} shadow-card`}
        // Nested nodes must not become separate drag sources.
        draggable={false}
      >
        {/* Front */}
        <div
          className={`flip-face border border-white/15 font-black text-white ${bgClass} ${
            selected ? "ring-2 ring-accent" : ""
          } ${dimmed ? "opacity-40" : ""}`}
          draggable={false}
        >
          {card ? (
            <>
              <span className="text-[1.5em] leading-none tracking-tight">{rankLabel}</span>
              <span className="text-[0.95em] leading-none">{SUIT_SYMBOL[suit!]}</span>
            </>
          ) : null}
        </div>
        {/* Back */}
        <div className="flip-face flip-back" draggable={false}>
          <span className="text-lg">◈</span>
        </div>
      </div>
    </div>
  );
}
