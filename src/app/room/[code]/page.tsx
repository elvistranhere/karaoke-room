"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { RoomView } from "~/components/room/RoomView";

function RoomContent() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const code = params.code?.toUpperCase() ?? "";
  const name = searchParams.get("name") ?? "Anonymous";

  if (!code) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p style={{ color: "var(--color-neon-pink)" }}>Invalid room code.</p>
      </div>
    );
  }

  return <RoomView roomCode={code} playerName={name} />;
}

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <div
            className="text-lg"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--color-neon-cyan)",
              animation: "neon-pulse 1.5s ease-in-out infinite",
            }}
          >
            Entering room...
          </div>
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
