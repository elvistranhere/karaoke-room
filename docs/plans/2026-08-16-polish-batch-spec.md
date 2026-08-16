# Polish batch spec (post shadcn migration)

Owner-approved batch, designed in session on 2026-08-16. Every item must work across desktop, Android, and iOS Safari: touch-first hit areas (40px), no hover-only affordances, gestures respected for audio, safe-area aware.

1. **NC trigger label**: Select trigger shows "NC · Auto|On|Off" (Base UI SelectValue renders raw values; map to labels). Full name "Noise cancellation" in tooltip.
2. **Voice FX popover**: the Echo toggle becomes a popover (shadcn Popover) anchored to a toolbar button. Content: six effect chips (None, Hall, Echo, Warm, Bright, Chorus) wired to setVoiceEffect, an intensity Slider wired to setEffectWetDry (disabled on None), and an "Advanced" link opening Sound Profile. Button shows the active effect name ("Voice FX" when none) with violet tint when active. Persistence already exists (karaoke-voice-effect, karaoke-effect-wetdry). Popover must be touch-friendly and fit a 360px viewport.
3. **Mic/deafen color semantics**: purple fill = live, red slash = muted or deafened, gray = neutral. Mic muted state gets the danger treatment (matching deafen), not plain gray.
4. **Toolbar rhythm**: 44px circles, 40px rect controls on one baseline, meter vertically centered in a fixed slot, Echo/FX on-state uses fill tint without the loud border.
5. **Dynamic tab title**: in a room, document.title = "{roomName || 'Room ' + code} · Karaoke Now" via client effect; restore default on unmount.
6. **Settings split**: Sheet content grouped into "Personal" (display name, output volume, reset per-person volumes) and a crown-marked "Host settings" (room name, Show in Browse, room password), the latter rendered only for admins.
7. **Mic on by default at join**: the Join the party click enables the mic when localStorage karaoke-mic-on is not "off". toggleMic persists the preference. Permission denial shows the muted state honestly, no silent failure. Button always reflects the actual published track state.
8. **PeoplePanel alignment + crown**: right-side badge cluster uses fixed-width slots so icons align across rows (self rows reserve the mute-button slot empty). Crown pinned to var(--color-accent), verified rendering for the host row.
9. **Queue rows without "Unknown"**: person name is the primary line; song shows only when set. No placeholder text when the song is missing.
10. **Stage takeover announcement**: when currentSingerId transitions to a non-null value, an animated overlay sweeps the stage area (name + mic glyph, scale and fade in, auto-dismiss ~3s, staggered per make-interfaces-feel-better). If it is YOUR turn, a stronger "You're up!" variant plus a short two-tone chime. The chime routes through the existing audio plumbing so deafen silences it, and it only ever plays after the join gesture (autoplay-safe on iOS). No emojis.

Already in the working tree from this session: chat system messages with wrench styling and host/singer role badges in ChatPanel.

Cross-platform acceptance: every new interactive element reachable by touch without hover, popovers and overlays fit 360px width, nothing relies on document.title side effects for logic, chime is gesture-gated, and typecheck plus build stay green.

11. **Song title visibility**: the singer stage header's editable song title renders in var(--color-accent) (amber), matching the listener view; pencil affordance visible. It is currently near-invisible dark-on-dark after the migration.
12. **Icon color sweep**: every icon chip and tinted glyph pinned to its palette var (music note amber, search violet, timer violet); no gray component defaults leaking.
13. **Settings sheet full-screen on mobile**: Sheet content w-full below the sm breakpoint with safe-area padding; side-panel width from tablet up.
