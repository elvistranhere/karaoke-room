"use client";

import type { PanelId, RoomPanel } from "./panels";
import { DIVIDER, SURFACE_PANEL } from "~/lib/surfaces";

interface PanelHostProps {
  panels: RoomPanel[];
  activeId: PanelId;
  onSelect: (id: PanelId) => void;
  label: string;
}

export function PanelHost({ panels, activeId, onSelect, label }: PanelHostProps) {
  const active = panels.find((panel) => panel.id === activeId) ?? panels[0];
  if (!active) return null;

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl ${SURFACE_PANEL}`}>
      <div
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
        className="hidden shrink-0 items-center gap-1 border-b p-2 lg:flex"
        style={{ borderColor: DIVIDER }}
      >
        {panels.map((panel) => {
          const isActive = panel.id === active.id;
          return (
            <button
              key={panel.id}
              role="tab"
              id={`panel-tab-${panel.id}`}
              aria-selected={isActive}
              aria-controls={`panel-body-${panel.id}`}
              onClick={() => onSelect(panel.id)}
              className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[calc(var(--radius-2xl)-0.5rem)] px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 ease-out"
              style={{
                fontFamily: "var(--font-display)",
                background: isActive ? "var(--color-primary-dim)" : "transparent",
                color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
                boxShadow: isActive ? "var(--shadow-elevation-0)" : undefined,
              }}
            >
              {panel.label}
              {panel.count !== undefined ? (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                  style={{
                    background: "var(--color-dark-card)",
                    color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
                  }}
                >
                  {panel.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-body-${active.id}`}
        aria-labelledby={`panel-tab-${active.id}`}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {active.content}
      </div>
    </div>
  );
}
