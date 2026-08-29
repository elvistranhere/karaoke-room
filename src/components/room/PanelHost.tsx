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
  const isTabbed = panels.length > 1;

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl ${SURFACE_PANEL}`}>
      {isTabbed ? (
        <div
          role="tablist"
          aria-label={label}
          aria-orientation="horizontal"
          className="hidden h-12 shrink-0 items-stretch lg:flex"
          style={{
            borderBottom: `1px solid ${DIVIDER}`,
          }}
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
                className="relative flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 px-3 text-sm font-semibold outline-none transition-[background-color,color] duration-150 ease-out hover:bg-white/[0.02] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                style={{
                  fontFamily: "var(--font-display)",
                  color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)",
                }}
              >
                {panel.label}
                {panel.count !== undefined ? (
                  <span
                    className="min-w-5 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums"
                    style={{
                      background: "var(--color-dark-card)",
                      color: isActive ? "var(--color-primary-soft)" : "var(--color-text-muted)",
                    }}
                  >
                    {panel.count}
                  </span>
                ) : null}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-6 bottom-0 h-0.5 rounded-t-full transition-opacity duration-150"
                  style={{
                    background: "linear-gradient(90deg, var(--color-primary), var(--color-primary-soft))",
                    opacity: isActive ? 1 : 0,
                  }}
                />
              </button>
            );
          })}
        </div>
      ) : (
        <div
          id={`panel-tab-${active.id}`}
          className="hidden h-12 shrink-0 items-center px-4 text-sm font-semibold lg:flex"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-text-primary)",
            borderBottom: `1px solid ${DIVIDER}`,
          }}
        >
          {active.label}
        </div>
      )}

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
