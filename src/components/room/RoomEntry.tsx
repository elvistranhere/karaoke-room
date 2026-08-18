"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { getSavedName, saveName, sanitizeName, MAX_NAME_LENGTH } from "~/lib/playerName";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

const RoomView = dynamic(
  () => import("~/components/room/RoomView").then((m) => m.RoomView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-lg" style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", animation: "fade-in 0.5s ease-out" }}>
          Loading room...
        </div>
      </div>
    ),
  }
);

function RoomContent() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = params.code?.toUpperCase() ?? "";

  // Name priority: URL param (backward compat) > localStorage > prompt modal
  // Treat empty/whitespace-only ?name= as no name (don't persist "Anonymous")
  const rawUrlName = searchParams.get("name");
  const urlName = rawUrlName?.trim() || null;
  // Defer localStorage read to avoid hydration mismatch (server has no localStorage)
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("Anonymous");
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameConflict, setNameConflict] = useState<{ name: string; suggestions: string[] } | null>(null);
  useEffect(() => {
    const savedName = getSavedName();
    const needsPrompt = !urlName && !savedName;
    setName(needsPrompt ? "Anonymous" : sanitizeName(urlName ?? savedName));
    setShowNameModal(needsPrompt);
    setMounted(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If name came from URL param, save to localStorage and clean URL
  useEffect(() => {
    if (!urlName || !code) return;
    const persisted = saveName(urlName);
    if (persisted) router.replace(`/room/${code}`);
  }, [urlName, code, router]);

  if (!mounted) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-lg" style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", animation: "fade-in 0.5s ease-out" }}>
          Loading room...
        </div>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p style={{ color: "var(--color-danger)" }}>Invalid room code.</p>
      </div>
    );
  }

  const handleRename = (newName: string) => {
    const clean = sanitizeName(newName);
    setName(clean);
    // saveName("") removes the entry from localStorage; non-empty persists
    saveName(clean === "Anonymous" ? "" : clean);
  };

  const handleNameSubmit = (newName: string) => {
    const trimmed = newName.trim();
    const clean = trimmed || "Anonymous";
    setName(clean);
    // Don't persist "Anonymous" - let the modal show again next time
    if (trimmed) saveName(trimmed);
    setShowNameModal(false);
  };

  const handleNameRejected = (info: { name: string; suggestions: string[] }) => {
    setNameConflict(info);
  };

  const handleConflictSubmit = (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setNameConflict(null);
      return;
    }
    const clean = sanitizeName(trimmed);
    if (clean === name) {
      // Same name as before - still taken, don't close modal
      return;
    }
    setName(clean);
    saveName(clean === "Anonymous" ? "" : clean);
    setNameConflict(null);
  };

  // Don't mount RoomView until INITIAL name is resolved (first visit only)
  if (showNameModal) {
    return <NameModal onSubmit={handleNameSubmit} />;
  }

  return (
    <>
      <RoomView roomCode={code} playerName={name} onRename={handleRename} onNameRejected={handleNameRejected} />
      {/* Name conflict overlay - does NOT unmount RoomView */}
      {nameConflict && (
        <NameModal onSubmit={handleConflictSubmit} conflict={nameConflict} />
      )}
    </>
  );
}

function NameModal({ onSubmit, conflict }: { onSubmit: (name: string) => void; conflict?: { name: string; suggestions: string[] } | null }) {
  const [draft, setDraft] = useState(conflict?.name ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync draft if conflict changes (e.g. multiple name-taken events)
  useEffect(() => { if (conflict?.name) setDraft(conflict.name); }, [conflict?.name]);

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onSubmit(""); }}>
      <DialogContent className="bg-background sm:max-w-80" showCloseButton={false} initialFocus={inputRef}>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-display)", color: conflict ? "var(--color-accent)" : undefined }}>
            {conflict ? "Name already taken" : "What should we call you?"}
          </DialogTitle>
          <DialogDescription>
            {conflict
              ? `Someone in the room is already named "${conflict.name}". Pick a different name.`
              : "Or skip to join as Anonymous."
            }
          </DialogDescription>
        </DialogHeader>

        {conflict && conflict.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {conflict.suggestions.map((s) => (
              <Button key={s} size="sm" variant="outline" onClick={() => onSubmit(s)}>
                {s}
              </Button>
            ))}
          </div>
        )}

        <label htmlFor="name-input" className="sr-only">Your name</label>
        <input
          id="name-input"
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_NAME_LENGTH))}
          placeholder="Your name"
          className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          style={{ background: "var(--color-dark-card)", color: "var(--color-text-primary)" }}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(draft); }}
        />

        <div className="flex gap-2">
          <Button onClick={() => onSubmit(draft)} className="h-10 flex-1" style={{ fontFamily: "var(--font-display)" }}>
            {draft.trim() ? "Join" : "Join as Anonymous"}
          </Button>
          <Button variant="outline" onClick={() => onSubmit("")} className="h-10 px-4">
            Skip
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RoomEntry() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center">
          <div className="text-lg" style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", animation: "fade-in 0.5s ease-out" }}>
            Entering room...
          </div>
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
