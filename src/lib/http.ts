import { NextResponse } from "next/server";
import { GameError } from "@/server/engine";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: unknown): NextResponse {
  if (error instanceof GameError) {
    const status =
      error.code === "AUTH" || error.code === "FORBIDDEN"
        ? 403
        : error.code === "NOT_FOUND" || error.code === "INVALID_ROOM"
          ? 404
          : 400;
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status });
  }
  if (error && typeof error === "object" && "issues" in error) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", message: "Invalid request", issues: (error as any).issues },
      { status: 422 }
    );
  }
  console.error("Unhandled error:", error);
  return NextResponse.json({ ok: false, code: "INTERNAL", message: "Server error" }, { status: 500 });
}
