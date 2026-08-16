# Design references

- `theme-directions.html`: the three mocked reskin directions (Linear Minimal, Glass Over Stage, Media Dark). Owner direction: hybrid base (borderless Linear elevation for panels, glass only where content glows behind: stage, overlays), with COLOR driven dynamically by the song via the atmosphere token contract, not a fixed theme. Voice-energy glow drives intensity.
- Volume and status semantics reference Discord: per-user local volume, mute and deafen slash glyphs rightmost on rows, purple fill = live, red slash = cut, crown = host (amber).
- Component primitives: shadcn/ui (base-nova, Base UI) in src/components/ui, centrally themed to Neon Pulse.
- Interaction polish rules: .claude/skills/make-interfaces-feel-better (concentric radii, shadows over borders, specific transitions, 40px targets, tabular-nums).
