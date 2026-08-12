# Neon Pulse Design System

Neon Pulse is the visual system for Karaoke Now, a social online karaoke platform. It combines premium dark surfaces, vibrant neon accents, and focused interaction patterns suited to high-energy shared rooms.

## Vision

The product should feel like a modern neon-lit karaoke lounge: atmospheric and expressive without becoming visually noisy. Every screen should remain easy to understand, comfortable to scan, and focused on the next meaningful action.

## Visual principles

1. **Frictionless flow** — reduce cognitive load with clear hierarchy, generous spacing, and focused layouts.
2. **Atmospheric contrast** — use deep black and charcoal surfaces as the canvas for purple, lavender, and pink accents.
3. **Intentional hierarchy** — reserve scale, gradients, and glow for primary actions and active states.
4. **Consistent rhythm** — related controls must share heights, padding, corner radii, typography, and alignment.
5. **Responsive by design** — desktop uses a structured multi-panel workspace; mobile gives each primary room section the full available viewport.

## Color tokens

### Surfaces

| Token | Value | Usage |
| --- | --- | --- |
| `background` | `#0E0E11` | App background and deepest canvas |
| `surface` | `#131316` | Primary panels and navigation |
| `surface-dim` | `#131316` | Subdued panel surfaces |
| `surface-bright` | `#39393C` | Strong hover or selected surfaces |
| `surface-container-lowest` | `#0E0E11` | Recessed areas |
| `surface-container-low` | `#1B1B1E` | Secondary sections |
| `surface-container` | `#212124` | Cards and controls |
| `surface-container-high` | `#2B2B2E` | Hovered controls and elevated elements |
| `surface-container-highest` | `#363639` | Highest non-modal surface |

### Brand and accents

| Token | Value | Usage |
| --- | --- | --- |
| `primary` | `#9D5CFF` | Primary actions, active states, focus |
| `primary-container` | `#3D1C7A` | Selected backgrounds and tonal buttons |
| `on-primary` | `#FFFFFF` | Text and icons on primary |
| `secondary` | `#D0BCFF` | Soft emphasis and supporting icons |
| `secondary-container` | `#4A4458` | Secondary tonal surfaces |
| `tertiary` | `#FF5C9D` | Social accents and special highlights |

### Functional colors

| Token | Value | Usage |
| --- | --- | --- |
| `outline` | `#938F99` | High-visibility outlines and disabled borders |
| `error` | `#FFB4AB` | Errors and destructive feedback |
| `on-background` | `#E6E1E5` | Primary text on dark surfaces |

Use white borders at approximately 10% opacity for standard panel separation. Muted text should remain readable and must not rely on opacity alone to communicate state.

## Typography

Use **Montserrat**, with `sans-serif` as the fallback.

| Scale | Size | Weight | Letter spacing | Usage |
| --- | --- | --- | --- | --- |
| Display large | `57px` | `700` | `-0.25px` | Marketing-only hero text |
| Headline large | `32px` | `600` | Default | Primary page headings |
| Headline medium | `28px` | `600` | Default | Section hero headings |
| Title large | `22px` | `500` | Default | Card and modal titles |
| Body large | `16px` | `400` | Default | Primary body copy |
| Label large | `14px` | `500` | Default | Controls and compact headings |

### Typography rules

- Use sentence case for headings and labels; avoid all-caps UI text.
- Use no more than three clear type sizes in a single panel.
- Use weight and color before introducing another font size.
- Keep body copy at a comfortable line height of approximately `1.5`.
- Use tabular numbers for timers, queue positions, and changing audio values.

## Spacing and layout

- Desktop container padding: `40px`
- Mobile container padding: `20px`
- Standard grid gutter: `24px`
- Base spacing unit: `4px`
- Preferred control height: `40px`
- Compact control height: `32px`
- Minimum touch target: `44px × 44px`

Room layouts should use a balanced three-column composition on desktop: participants and queue, stage, and room chat. Constrain ultra-wide content so the center stage does not become excessively stretched. On mobile, use a section switcher and let the selected section fill the remaining viewport height.

## Shape

Use restrained roundness. Avoid mixing multiple corner styles within the same hierarchy.

| Token | Value | Usage |
| --- | --- | --- |
| Large radius | `16px` | Main panels, large cards, modals |
| Medium radius | `8px` | Buttons, inputs, nested controls |
| Small radius | `4px` | Tags and compact indicators |

Circular controls are reserved for microphones, avatars, icon-only actions, and live-status indicators.

## Components

### Cards and panels

- Background: `surface-container`
- Border: `1px solid rgba(255, 255, 255, 0.1)`
- Padding: `32px` for standalone cards; room panels may use denser `16–24px` spacing
- Radius: `16px`
- Shadow: none by default

Panel headers that sit beside one another must use the same font size, weight, horizontal padding, vertical padding, and border treatment.

### Primary buttons

- Background: `linear-gradient(135deg, #9D5CFF 0%, #7C3AED 100%)`
- Text: `on-primary`
- Padding: `12px 24px`
- Radius: `8px`
- Glow: `0 0 20px rgba(157, 92, 255, 0.4)`

Use the glow only for the primary action in a view. Hover states may increase brightness slightly; pressed states should use a subtle scale or tonal shift.

### Secondary buttons

Use `surface-container-high` with a low-contrast border. Secondary actions must never compete visually with the primary action. Destructive actions use a solid red treatment and explicit text.

### Inputs and selectors

- Use a `surface-container` background and medium radius.
- Use a subtle default border and `primary` focus border.
- Keep labels visible whenever meaning would be unclear from placeholder text.
- Related selectors should use equal heights and aligned labels.

### Audio controls

- Group the microphone, audio visualization, volume slider, noise cancellation, and sound profile into one coherent toolbar.
- Keep the volume slider visually dominant within the toolbar.
- Use the primary violet for active audio and a neutral track for remaining range.
- Noise cancellation uses `Auto`, `On`, and `Off`; `Auto` means on while talking and off while singing.
- Sound profile displays the active Talk or Sing profile and opens detailed audio settings.
- Avoid duplicating mic checks. Use one mic-check flow with a Talk/Sing profile selector.

### Room panels

- Participants and Room chat headers must share the same visual dimensions.
- Keep queue actions anchored and easy to discover.
- Empty states should provide a calm focal point and one useful next step.
- Reaction controls belong with chat and should remain secondary to message composition.

## Interaction states

- **Hover:** slight surface lift, brighter border, or `1.02–1.05` scale for compact actions.
- **Pressed:** subtle `0.98` scale.
- **Focus:** visible `2px` primary outline with sufficient offset.
- **Selected:** primary-container background with secondary or white content.
- **Disabled:** reduced contrast while preserving readable text; disable pointer affordances.
- **Error:** show concise error text near the affected control; do not rely on color alone.

Animation should be brief and purposeful, generally between `120ms` and `220ms`. Avoid continuous glow or motion unless it communicates live audio, speaking, recording, or another changing state.

## Accessibility

- Meet WCAG AA contrast for text and essential controls.
- All icon-only actions require accessible names and tooltips where useful.
- Never communicate mute, connection, recording, or error state with color alone.
- Preserve keyboard access, visible focus, and logical tab order.
- Respect reduced-motion preferences.
- Keep interactive targets at least `44px` on touch devices.

## Implementation guidance

Define these values as shared CSS tokens and consume them through components instead of repeating raw colors. New UI should reuse existing cards, buttons, inputs, panel headers, and toolbar patterns. When a new pattern is necessary, validate it at desktop and mobile widths before adding it to the system.

The design system is the default source of truth for new UI. Existing surfaces should migrate toward it incrementally without changing working product behavior solely for visual consistency.
