"use client";

import { rankOf, suitOf, type Card } from "@/core/cards";

const SUIT_SYMBOL: Record<string, string> = { c: "♣", d: "♦", h: "♥", s: "♠" };
const RED = new Set(["d", "h"]);

const SIZES = {
  sm: "h-12 w-9 text-sm rounded-md",
  md: "h-16 w-12 text-base rounded-lg",
  lg: "h-20 w-14 text-lg rounded-lg",
} as const;

export function PlayingCard({
  card,
  size = "md",
  selected = false,
  dimmed = false,
  onClick,
  faceDown = false,
}: {
  card?: Card | null;
  size?: keyof typeof SIZES;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  faceDown?: boolean;
}) {
  const base = `relative inline-flex flex-col items-center justify-center border font-semibold
    shadow-card transition-all ${SIZES[size]}`;

  if (faceDown || !card) {
    return (
      <div
        className={`${base} bg-gradient-to-br from-felt-700 to-felt-900 border-white/10 text-accent/40`}
        aria-label="Face-down card"
      >
        <span className="text-xl">◈</span>
      </div>
    );
  }

  const rank = rankOf(card);
  const suit = suitOf(card);
  const isRed = RED.has(suit);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${rank}${SUIT_SYMBOL[suit]}`}
      className={`${base} animate-flip bg-[#f7f5ef] border-black/10
        ${isRed ? "text-red-600" : "text-neutral-900"}
        ${selected ? "ring-2 ring-accent -translate-y-1.5" : ""}
        ${dimmed ? "opacity-40" : ""}
        ${onClick ? "cursor-pointer hover:-translate-y-1" : "cursor-default"}`}
    >
      <span className="leading-none">{rank === "T" ? "10" : rank}</span>
      <span className="leading-none">{SUIT_SYMBOL[suit]}</span>
    </button>
  );
}
