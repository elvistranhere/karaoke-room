"use client";

import type { RoomState } from "~/types/room";

// Flags are room-scoped and server-owned: every client in a room sees the same
// value, which is what a synchronized-playback app needs.
export function useFlag(roomState: RoomState, name: string): boolean {
  return roomState.flags?.[name] === true;
}

export function useFlags(roomState: RoomState): Record<string, boolean> {
  return roomState.flags ?? {};
}
