"use client";

import type { Card } from "@/core/cards";
import type { BoardId } from "@/core/deal";
import { FlipCard } from "@/components/FlipCard";

const LABEL: Record<BoardId, string> = { top: "TOP", middle: "MID", bottom: "BTM" };

/**
 * One community board row: label + 3 flop + turn + river.
 * When `dealFlop` is true, the flop cards deal in with a staggered flip.
 */
export function CommunityBoard({
  boardId,
  flop,
  turn,
  river,
  size = "md",
  active = false,
  dealFlop = false,
  usedCommunity = null,
  right,
}: {
  boardId: BoardId;
  flop: Card[];
  turn: Card | null;
  river: Card | null;
  size?: "xs" | "sm" | "md";
  active?: boolean;
  dealFlop?: boolean;
  /** When set, community cards NOT in this set are dimmed (winner's 3 used). */
  usedCommunity?: Set<Card> | null;
  right?: React.ReactNode;
}) {
  const dim = (c: Card | null) => (usedCommunity && c ? !usedCommunity.has(c) : false);
  return (
    <div
      className={`flex items-center gap-1.5 rounded-xl px-1.5 py-1 transition-colors sm:gap-2 sm:px-2 sm:py-1.5 ${
        active ? "bg-white/5 ring-1 ring-accent/40" : ""
      }`}
    >
      <span className="w-7 shrink-0 text-center text-[9px] font-bold tracking-widest text-accent/70 sm:w-8 sm:text-[10px]">
        {LABEL[boardId]}
      </span>
      <div className="flex items-center gap-1 sm:gap-1.5">
        {flop.map((c, i) => (
          <FlipCard
            key={c}
            card={c}
            size={size}
            dealDelayMs={dealFlop ? 150 + i * 130 : undefined}
            dimmed={dim(c)}
          />
        ))}
        <div className="mx-0.5 h-6 w-px bg-white/10 sm:h-8" />
        <FlipCard card={turn} faceDown={!turn} size={size} dimmed={dim(turn)} />
        <FlipCard card={river} faceDown={!river} size={size} dimmed={dim(river)} />
      </div>
      {right && <div className="ml-0.5 sm:ml-1">{right}</div>}
    </div>
  );
}
