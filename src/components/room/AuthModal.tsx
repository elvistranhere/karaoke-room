"use client";

import { useRef, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

interface AuthModalProps {
  onSubmit: (password: string) => void;
  authFailed: boolean;
}

export function AuthModal({ onSubmit, authFailed }: AuthModalProps) {
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = () => {
    if (password.trim()) {
      onSubmit(password.trim());
    }
  };

  return (
    <Dialog open disablePointerDismissal>
      <DialogContent
        className="sm:max-w-80"
        showCloseButton={false}
        initialFocus={inputRef}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Lock size={16} style={{ color: "var(--color-accent)" }} />
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>Room is locked</DialogTitle>
          </div>
          <DialogDescription>Enter the room password to join.</DialogDescription>
        </DialogHeader>

        {authFailed && (
          <p className="text-xs" style={{ color: "var(--color-danger)" }}>
            Incorrect password. Try again.
          </p>
        )}

        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Room password"
          className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          style={{ background: "var(--color-dark-card)", color: "var(--color-text-primary)" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
        />

        <Button
          onClick={handleSubmit}
          disabled={!password.trim()}
          className="h-10 w-full"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Enter Room
        </Button>
      </DialogContent>
    </Dialog>
  );
}
