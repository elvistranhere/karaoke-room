import type { ReactNode } from "react";

export type PanelId = "people" | "queue" | "chat";

export type PanelRegion = "left" | "right";

export type RoomSectionId = "stage" | PanelId;

export interface RoomPanel {
  id: PanelId;
  label: string;
  region: PanelRegion;
  content: ReactNode;
  count?: number;
}

export function panelsInRegion(panels: RoomPanel[], region: PanelRegion): RoomPanel[] {
  return panels.filter((panel) => panel.region === region);
}
