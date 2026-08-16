"use client";

import { useState, type ReactNode } from "react";
import { PanelHost } from "./PanelHost";
import { panelsInRegion, type PanelId, type PanelRegion, type RoomPanel, type RoomSectionId } from "./panels";

const RAIL_CLASS: Record<PanelRegion, string> = {
  left: "min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl lg:flex lg:w-64 lg:flex-none lg:shrink-0 xl:w-72",
  right: "min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl lg:flex lg:w-72 lg:flex-none lg:shrink-0 xl:w-80",
};

const RAIL_LABEL: Record<PanelRegion, string> = {
  left: "Room panels",
  right: "Chat panels",
};

interface RoomShellProps {
  panels: RoomPanel[];
  stage: ReactNode;
}

export function RoomShell({ panels, stage }: RoomShellProps) {
  const [section, setSection] = useState<RoomSectionId>("stage");
  const [activeByRegion, setActiveByRegion] = useState<Partial<Record<PanelRegion, PanelId>>>({});

  const selectPanel = (panel: RoomPanel) => {
    setActiveByRegion((current) => ({ ...current, [panel.region]: panel.id }));
    setSection(panel.id);
  };

  const renderRail = (region: PanelRegion) => {
    const regionPanels = panelsInRegion(panels, region);
    const first = regionPanels[0];
    if (!first) return null;
    return (
      <aside
        className={`${RAIL_CLASS[region]} ${regionPanels.some((panel) => panel.id === section) ? "flex" : "hidden"}`}
      >
        <PanelHost
          panels={regionPanels}
          activeId={activeByRegion[region] ?? first.id}
          label={RAIL_LABEL[region]}
          onSelect={(id) => {
            const next = regionPanels.find((panel) => panel.id === id);
            if (next) selectPanel(next);
          }}
        />
      </aside>
    );
  };

  return (
    <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 flex-col gap-2 overflow-hidden px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 lg:flex-row lg:gap-3 lg:px-4 lg:pb-[max(env(safe-area-inset-bottom),1rem)] lg:pt-4 xl:gap-4">
      <div
        role="group"
        className="grid shrink-0 gap-1 rounded-lg p-1 shadow-[var(--shadow-elevation-1)] lg:hidden"
        style={{
          background: "var(--color-dark-surface)",
          gridTemplateColumns: `repeat(${panels.length + 1}, minmax(0, 1fr))`,
        }}
        aria-label="Room sections"
      >
        <SectionButton label="Stage" isActive={section === "stage"} onClick={() => setSection("stage")} />
        {panels.map((panel) => (
          <SectionButton
            key={panel.id}
            label={panel.label}
            count={panel.count}
            isActive={section === panel.id}
            onClick={() => selectPanel(panel)}
          />
        ))}
      </div>

      {renderRail("left")}

      <section
        data-testid="room-stage"
        className={`min-h-0 min-w-0 flex-1 flex-col gap-3 ${section === "stage" ? "flex" : "hidden"} lg:flex`}
      >
        {stage}
      </section>

      {renderRail("right")}
    </div>
  );
}

function SectionButton({
  label,
  count,
  isActive,
  onClick,
}: {
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={isActive}
      className="flex min-h-10 cursor-pointer items-center justify-center gap-1 rounded-sm px-2 py-3 text-xs font-semibold transition-[background-color,color,box-shadow] duration-150 ease-out"
      style={{
        fontFamily: "var(--font-display)",
        background: isActive ? "var(--color-primary-dim)" : "transparent",
        color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
        boxShadow: isActive ? "var(--shadow-elevation-0)" : undefined,
      }}
    >
      {label}
      {count !== undefined ? (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{
            background: "var(--color-dark-card)",
            color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
