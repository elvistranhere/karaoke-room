## What

<!-- What changed and why. Rationale for non-obvious code goes here, not in comments. -->

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Tested in a room with two clients where the change touches sync, audio, or room state

## Protocol

- [ ] This PR changes no PartyKit protocol or `RoomState` shape
- [ ] Or: the protocol change is **additive** (new optional fields / new message types only), so clients running the old bundle keep working during the PartyKit-before-Vercel deploy gap
- [ ] `party/types.ts` and `src/types/room.ts` are in sync
- [ ] Needs `npm run deploy:party` after merge (`party/` changed)
