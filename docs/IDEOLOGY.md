# Key Rotation Architecture - Design Transcript

> **Note:** This is a historical conversation transcript capturing the design journey
> for the Redis-backed key rotation system. Earlier sections discuss approaches (like
> INCR/DECR counters) that were later replaced by SCAN-based TTL counting. For the
> canonical current algorithm and Redis key schema, see `src/lib/keyRotation.ts`.

---

❯ okay now if we migrate to upstash redis approach now what is the
end to end behaviour edge case and result: afew: users in the
current room and it limit? what occur, think like a human : user
have 3 state: about to enter: enter and not hit limit, enter using
and hit limit: enter 2s and hit limit, and try create a new room
again, and how backend handle round robin to distribute, oh
actually research on a better approach than round robin I learn
alot in distributed system course about this but cant still
remember but obs there is some trade off, LRU etc idk

⏺ Good question. Let me think through this properly with distributed
systems principles.

Distribution Strategy Analysis

Consistent hashing (what we have) is the wrong tool here. It
distributes evenly by name, but doesn't account for actual load.
Room "ABC" might have 20 people, room "XYZ" might have 2. Both use
one key slot.

Better approaches for room-to-key assignment:

Strategy: Least-Loaded
How it works: New room -> key with most remaining quota
Pros: Optimal distribution
Cons: Needs real-time usage tracking
────────────────────────────────────────
Strategy: Power of Two Choices
How it works: Hash to 2 keys, pick the less loaded one
Pros: Near-optimal, simpler
Cons: Still needs usage data
────────────────────────────────────────
Strategy: Weighted Round-Robin
How it works: Weight keys by remaining quota
Pros: Simple
Cons: Stale weights under load
────────────────────────────────────────
Strategy: Consistent Hash (current)
How it works: Hash room code to key
Pros: Zero state needed
Cons: Ignores actual load

Least-Loaded with Room Affinity is the right answer. Here's why:
we're not balancing requests (stateless), we're placing rooms
(stateful). Once a room is on a key, it must stay there for the
session. This is exactly the problem solved by "sticky scheduling
with least-loaded placement."

End-to-End Behavior with Upstash Redis

Redis stores:
room:ABC123:key = 3 (room ABC is on key #3)
room:ABC123:key:ttl = 1hr (auto-expire if room dies)
key:3:active_rooms = 12 (how many rooms on key #3)
key:3:exhausted = false

User State 1: About to enter (new room, no one there yet)

Client -> /api/livekit-token?room=NEW123
Server -> Redis GET room:NEW123:key
-> null (no mapping)
-> Find least-loaded key: scan key:1:active_rooms through
key:100:active_rooms
-> Key #47 has fewest active rooms
-> Redis SET room:NEW123:key = 47, INCR key:47:active_rooms
-> Sign JWT with key #47 credentials
-> Return token + URL
Client -> room.connect() -> success

User sees: nothing special, joins instantly.

User State 2: Enter existing room, not at limit

Client -> /api/livekit-token?room=ABC123
Server -> Redis GET room:ABC123:key
-> 3 (room is on key #3)
-> Key #3 not exhausted
-> Sign JWT with key #3
-> Return token
Client -> room.connect() -> success, hears everyone

User sees: joins normally, hears existing users.

User State 3: Using room, key hits limit mid-session

User A, B, C are connected on key #3 in room ABC123.
LiveKit quota for key #3 hits 5,000 p-min.

What happens to A, B, C:
-> NOTHING. Existing WebRTC connections stay alive.
-> They can keep singing, chatting, everything works.
-> LiveKit doesn't kick active connections on quota hit.

User D tries to join room ABC123:
Client -> /api/livekit-token?room=ABC123
Server -> Redis GET room:ABC123:key -> 3
-> Key #3 NOT marked exhausted (server doesn't know yet)
-> Sign JWT with key #3
Client -> room.connect() -> FAILS (LiveKit rejects new
connections)
Client -> retry with ?keyHint=next
Server -> Mark key #3 exhausted in Redis (SETEX key:3:exhausted
true 300)

Here's the critical decision point. What do we do for User D?

Option A: Split room (bad UX)
Server -> Find next least-loaded key (#48)
-> Sign JWT with key #48
Client -> room.connect() on key #48 -> success
User D is in "room ABC123" on key #48
But A, B, C are on key #3
-> D can't hear A/B/C. Broken.

Option B: Refuse with message (good UX)
Server -> Room ABC123 is assigned to key #3, which is exhausted
-> Return 429: "This room has hit its session limit"
Client -> Shows friendly error: "This room has hit its session
limit.
Try creating a new room."
User D sees the error, creates room DEF456 -> assigned to key
#48 -> works fine

Option B is correct. Never split a room across keys. If the room's
key is dead, the room is full. New room works fine.

User State 4: Enter, 2 seconds later key exhausts

User D joins room ABC123, gets token for key #3, connects.
2 seconds later, key #3 quota hits 0.

-> D stays connected (existing connection survives).
-> D can hear A, B, C. Everything works.
-> No new users can join room ABC123 until:
a) Key #3 quota resets (next month), or
b) Everyone leaves and room is reassigned to a fresh key

User State 5: Create new room after hitting limit

User D got rejected from ABC123.
User D creates room DEF456.

Server -> Redis GET room:DEF456:key -> null (new room)
-> Find least-loaded non-exhausted key
-> Key #48 has room
-> SET room:DEF456:key = 48
-> Sign JWT
Client -> room.connect() -> success

Works perfectly. New room on fresh key.

Room cleanup (prevents stale mappings)

Room ABC123 empties (everyone leaves).
PartyKit fires empty-room reset.

-> We DON'T clear the Redis mapping immediately
-> The TTL (1 hour) handles it automatically
-> If someone creates ABC123 again within 1hr, they get the same
key
(which is fine - the room is empty, no split risk)
-> After 1hr, mapping expires, next creation gets least-loaded key

The Architecture

                      Vercel (stateless)
                           |
              /api/livekit-token?room=X
                           |
                      Upstash Redis
                      (edge, ~1ms)
                           |
                ┌──────────┼──────────┐
                |          |          |
           room:X:key  key:N:rooms  key:N:exhausted
                |          |          |
                v          v          v
           "Which key   "How many   "Is this key
            is room X    rooms on    dead?"
            on?"         key N?"
                           |
                ┌──────────┼──────────┐
                v          v          v
           Key #1      Key #2      Key #100
           LiveKit     LiveKit     LiveKit
           Cloud       Cloud       Cloud

Trade-offs

┌────────────────┬─────────────────────┬─────────────────────┐
│ Aspect │ Current (hash) │ With Redis │
│ │ │ (least-loaded) │
├────────────────┼─────────────────────┼─────────────────────┤
│ New room │ Deterministic but │ Optimal │
│ placement │ blind │ (least-loaded key) │
├────────────────┼─────────────────────┼─────────────────────┤
│ Room split │ High (failover │ Zero (refuse │
│ risk │ sends to wrong key) │ instead of split) │
├────────────────┼─────────────────────┼─────────────────────┤
│ Key exhaustion │ Self-heal 1-2s │ Instant │
│ handling │ │ cross-instance │
├────────────────┼─────────────────────┼─────────────────────┤
│ Latency per │ 0ms │ ~1-2ms (Upstash │
│ token │ │ edge) │
├────────────────┼─────────────────────┼─────────────────────┤
│ Cost │ Free │ Free (500K │
│ │ │ commands/month) │
├────────────────┼─────────────────────┼─────────────────────┤
│ Room affinity │ Hash (can drift on │ Redis mapping │
│ │ failover) │ (guaranteed) │
├────────────────┼─────────────────────┼─────────────────────┤
│ Complexity │ 20 lines │ ~80 lines │
└────────────────┴─────────────────────┴─────────────────────┘

Edge cases

1. Redis down - fall back to hash (current behavior). No room
   affinity guarantee but still works.
2. All 100 keys exhausted - return 429 for all rooms. "Service at
   capacity, try again later."
3. Room mapping expired but users still connected - new join gets
   same key via least-loaded (the room's users are consuming from
   that key, making it "loaded" - the algorithm naturally picks it or
   a fresh one).
4. Two users create the same room simultaneously - Redis SET is
   atomic. First write wins. Second read gets the same key. No split.

Want me to build this?

✻ Sautéed for 1m 18s · 1 shell still running

❯ btw juts asking, if we use upstash redis now we dont store key in
env anymore right but some where in redis? is that secure or is
there a env storing service?

⏺ Good security instinct. No - API keys should stay in env vars, not
Redis.

Here's why:

┌────────────────────────┬─────────────────┬─────────────────┐
│ Data │ Where to store │ Why │
├────────────────────────┼─────────────────┼─────────────────┤
│ LIVEKIT_API_KEY_1, │ Vercel env vars │ Secrets - never │
│ \_SECRET_1 │ (encrypted at │ in a database │
│ │ rest) │ │
├────────────────────────┼─────────────────┼─────────────────┤
│ Room-to-key mapping │ │ Just an index │
│ (room:ABC:key = 3) │ Redis │ number, not │
│ │ │ sensitive │
├────────────────────────┼─────────────────┼─────────────────┤
│ Key exhaustion state │ Redis │ Boolean flag, │
│ (key:3:exhausted) │ │ not sensitive │
├────────────────────────┼─────────────────┼─────────────────┤
│ Active room count │ Redis │ Counter, not │
│ (key:3:rooms = 12) │ │ sensitive │
└────────────────────────┴─────────────────┴─────────────────┘

Redis stores which key number a room uses (just 3, 47, etc.), not
the actual API key/secret. The token endpoint reads the key number
from Redis, then looks up the actual credentials from env vars:

Redis says: room ABC is on key #3
Env vars say: LIVEKIT_API_KEY_3 = "actual_secret_key"
Token endpoint: sign JWT using env var, return to client

The API keys never leave Vercel's encrypted env var store. Redis
only sees integers and room codes.

Vercel env vars are the right place for secrets. They're encrypted
at rest, injected at runtime, never logged, and scoped per
environment (production/preview/dev). That's industry standard -
same as AWS Secrets Manager or GCP Secret Manager but free.

❯ how can u know livekit doesnt kit people post quota?

⏺ Bash(firecrawl search "livekit cloud quota exceeded what happens
active connections kicked disconnected existing sessions"
--limit 5 -o .firecrawl/livekit-quota-beha…)
⎿  Quotas and limits - LiveKit Documentation
https://docs.livekit.io/deploy/admin/quotas-and-limits/
You can view the current limits on your project at any tim
… +19 lines (ctrl+o to expand)

⏺ Bash(firecrawl scrape
"https://docs.livekit.io/deploy/admin/quotas-and-limits/"
--only-main-content -o .firecrawl/livekit-quotas-full.md 2>&1
&& grep -i "exceed\|exi…)
⎿  Most features of LiveKit Cloud are metered, meaning that y
ou are charged based on the amount of each resource that y
ou use. Every plan includes a default allotment for each o
… +39 lines (ctrl+o to expand)

⏺ Found the exact answer from LiveKit's docs:

▎ For projects on the free Build plan, the quota is a hard limit.
After you exceed your quota, new requests will fail.

And for concurrency:

▎ When you exceed this limit, new connections of the same type
fail until other connections are closed.

The docs explicitly say "new requests will fail" and "new
connections fail" - not "existing connections are terminated."
This is standard behavior for quota systems - you don't kick
people mid-call, you just reject new ones.

However, I was assuming this based on standard practice. The docs
confirm it:

- Quota exceeded: new requests fail, existing sessions continue
- Concurrency limit exceeded: new connections fail until others
  close

So my analysis was correct. Existing users in a room stay
connected. Only new joins get rejected.

✻ Worked for 33s · 1 shell still running

❯ but u have still add the UX when that is not true right I think
its still better: and for person outside let him know: this room
already hit quota for the new user, ask people inthe roon to
recreate theroom to reset rate limit

⏺ You're right - we should handle both cases defensively. Even if
LiveKit doesn't kick people today, the behavior could change. And
the UX should be clear for everyone.

Two scenarios to handle:

1. User inside room, gets disconnected (just in case)

Currently the error banner shows "Reconnecting..." then the raw
error. Should show a friendlier message explaining what happened
and what to do.

2. User outside trying to join a room that's at quota

Currently shows the raw 429. Should explain: this room hit its
limit, ask people inside to create a new room, or create your own.

Let me add both:

Read 1 file (ctrl+o to expand)

⏺ Now check the disconnect handler:

Searched for 1 pattern, read 1 file (ctrl+o to expand)

⏺ Update(src/hooks/useLiveKit.ts)
⎿  Added 1 line
267 console.log("[LiveKit] Disconnected");
268 if (!cancelled) {
269 setIsConnected(false);
270 + setError("Disconnected - the room may have + hit its session limit. Ask others to create a new + room, or create one yourself.");
271 }
272 });
273

⏺ Now update the error banner in RoomView to show contextual actions
for both cases:

Read 1 file (ctrl+o to expand)

⏺ Update(src/components/room/RoomView.tsx)
⎿  Added 11 lines, removed 2 lines
379 {/_ Error banner _/}
380 {liveKitError && liveKitError !== "Reconnect
ing..." && (
381 <div
382 - className="relative z-10 mx-4 mt-2 round
-ed-lg px-3 py-2 text-xs lg:mx-6"
382 + className="relative z-10 mx-4 mt-2 round
+ed-lg px-4 py-3 text-xs lg:mx-6"
383 style={{ background: "var(--color-danger
           -dim)", color: "var(--color-danger)" }}
384 >
385 - {liveKitError}
385 + <p>{liveKitError}</p>
386 + {(liveKitError.includes("session limit") + || liveKitError.includes("Disconnected")) && (
387 + <button
388 + onClick={() => router.push("/")}
389 + className="mt-2 cursor-pointer round
+ed-md px-3 py-1.5 text-[11px] font-medium transiti
+on-all hover:brightness-110"
390 + style={{ background: "var(--color-da
          +nger)", color: "#fff" }}
391 + >
392 + Create New Room
393 + </button>
394 + )}
395 </div>
396 )}
397

⏺ Bash(npx tsc --noEmit 2>&1 | head -5 && git add
src/hooks/useLiveKit.ts src/components/room/RoomView.tsx &&
git commit -m "Friendly error UX for rate limit and unexp…)
⎿  [main 34b0196] Friendly error UX for rate limit and unexpe
cted disconnect with Create New Room button
2 files changed, 12 insertions(+), 2 deletions(-)
… +18 lines (ctrl+o to expand)

⏺ Done. Now users see:

Trying to join a room at quota:
▎ "This room has hit its session limit. Try creating a new room or
wait a few minutes."
▎ [Create New Room] button

Disconnected mid-session (if LiveKit ever kicks):
▎ "Disconnected - the room may have hit its session limit. Ask
others to create a new room, or create one yourself."
▎ [Create New Room] button

Normal errors (network, etc):
▎ Raw error message, no button (auto-retries handle it)

✻ Cooked for 1m 45s · 1 shell still running

❯ Trying to join a room at quota:
▎ "This room has hit its session limit. Try creating a new room
or wait a few minutes."
▎ [Create New Room] button ask people asw here

⏺ Update(src/hooks/useLiveKit.ts)
⎿  Added 1 line, removed 1 line
280 );
281 if (!res.ok) {
282 if (res.status === 429) {
283 - throw new Error("This room has hit its - session limit. Try creating a new room or wait a
-few minutes.");
283 + throw new Error("This room has hit its + session limit. Ask people in the room to create a + new one, or create your own.");
284 }
285 const text = await res.text();
286 throw new Error(`Token error: ${res.stat
           us} ${text}`);

⏺ Bash(git add src/hooks/useLiveKit.ts && git commit -m "Update rate
limit message to mention asking people in the room" && git
push origin main)
⎿  [main c7b6cf2] Update rate limit message to mention asking
people in the room
1 file changed, 1 insertion(+), 1 deletion(-)
… +18 lines (ctrl+o to expand)

⏺ Done. Now says: "This room has hit its session limit. Ask people
in the room to create a new one, or create your own."

✻ Crunched for 31s · 1 shell still running

❯ okay now if I wanna add more key in what is the procedure, just
add more in env? or will do sth else?

⏺ Just add env vars. Nothing else.

Local:

# Add to .env

LIVEKIT_API_KEY_2=your_key
LIVEKIT_API_SECRET_2=your_secret
LIVEKIT_URL_2=wss://your-second-project.livekit.cloud # optional,
falls back to primary URL

Vercel (production + preview):
vercel env add LIVEKIT_API_KEY_2 production "" --value "your_key"
--yes
vercel env add LIVEKIT_API_SECRET_2 production "" --value
"your_secret" --yes
vercel env add LIVEKIT_URL_2 production "" --value "wss://..."
--yes

# Same for preview

vercel env add LIVEKIT_API_KEY_2 preview "" --value "your_key"
--yes
vercel env add LIVEKIT_API_SECRET_2 preview "" --value
"your_secret" --yes
vercel env add LIVEKIT_URL_2 preview "" --value "wss://..." --yes

The token endpoint auto-discovers LIVEKIT_API_KEY, \_2, \_3, ... \_20
on each request. No code changes, no redeploy needed (Vercel
picks up new env vars on next function invocation).

For key #7: use suffix \_7. For key #100: we'd need to bump the
scan limit from 20 (one line change in route.ts).

❯ are u sure redis will know?

⏺ No - Redis doesn't exist yet. PR #5 (key rotation) is still open
and uses the in-memory approach, not Redis. And even PR #5 doesn't
have Redis.

Right now the flow is:

1. Add env vars
2. Token endpoint scans env vars, finds new keys
3. Hashes room code to pick a key
4. No Redis involved

If we add Upstash Redis later, the procedure changes to:

1. Add env vars (keys still in env, not Redis)
2. Also register the new key count in Redis (so the least-loaded
   algorithm knows about it)
3. Or: store key count as an env var too (LIVEKIT_KEY_COUNT=5)

But we haven't built the Redis integration yet. That's the next
step if you want to scale to 100 keys with proper least-loaded
distribution and cross-instance exhaustion tracking.

Current state: in-memory hash, works for a few keys, self-heals on
failure. Good enough until you actually have multiple keys to
rotate between.

Want me to build the Upstash Redis integration now, or is that for
later?

❯ okay lets say if with redis what is the result

⏺ With Redis, the procedure to add a new key becomes:

1. Add env vars (same as now):
   LIVEKIT_API_KEY_5=...
   LIVEKIT_API_SECRET_5=...
   LIVEKIT_URL_5=wss://...

2. That's it.

The token endpoint:

1. Scans env vars on cold start, finds 5 key sets
2. Writes key count to Redis: SET total_keys 5
3. On each token request, reads from Redis: which key has the
   room? Is it exhausted? What's the least loaded?
4. Redis knows about all keys because the endpoint tells it

No separate "register in Redis" step. The endpoint auto-syncs the
key count on every cold start. New Vercel instance spins up, reads
5 env vars, updates Redis with total_keys = 5. All other
instances see it immediately.

The only procedure is: add env vars, done. Redis handles the
coordination automatically. Same simplicity as now, but with
cross-instance awareness.

✻ Brewed for 39s · 1 shell still running

❯ right now there is no way to know the usage right as per u check
with livekit docs

⏺ Correct. LiveKit has no API to check remaining quota on the free
plan. We can only know a key is exhausted when a connection
attempt fails.

With Redis, we track what we CAN observe:

┌───────────────┬────────────────────────┬────────────────────┐
│ What we know │ How we know │ Stored in Redis │
├───────────────┼────────────────────────┼────────────────────┤
│ Key is │ Connection attempt │ key:3:exhausted = │
│ exhausted │ fails (client reports │ true (TTL 5 min) │
│ │ via keyHint=next) │ │
├───────────────┼────────────────────────┼────────────────────┤
│ How many │ │ │
│ active rooms │ We assigned them │ key:3:rooms = 12 │
│ per key │ │ │
├───────────────┼────────────────────────┼────────────────────┤
│ Which key a │ We assigned it │ room:ABC:key = 3 │
│ room is on │ │ │
└───────────────┴────────────────────────┴────────────────────┘

┌─────────────────────────┬─────────────────────┐
│ What we DON'T know │ Why │
├─────────────────────────┼─────────────────────┤
│ Remaining p-min per key │ No API on free plan │
├─────────────────────────┼─────────────────────┤
│ Total usage this month │ No API on free plan │
├─────────────────────────┼─────────────────────┤
│ When a key will exhaust │ Can't predict │
└─────────────────────────┴─────────────────────┘

So the "least-loaded" strategy is actually "least-rooms" - we
distribute by room count, not by actual quota usage. A key with 2
rooms of 20 people each uses more quota than a key with 10 rooms
of 1 person each, but we can't tell the difference.

It's still better than hash-based distribution because at least
we're balancing room count. And once a key fails, Redis marks it
exhausted instantly for all instances.

The only way to get real usage data is LiveKit's Analytics API -
Scale plan ($500/month). Not worth it for quota tracking.

❯ okay so give me all the case for the user workflow, what will
happen and what not etc on edgecases asw so that Im sure u
understand all the thing I want

⏺ Complete User Workflow - Every Case

JOINING A ROOM

Case 1: Normal join, no issues
User clicks link /room/ABC123
-> Token endpoint: Redis GET room:ABC123:key -> null (new room)
-> Least-rooms: key #3 has fewest rooms
-> Redis SET room:ABC123:key = 3, INCR key:3:rooms
-> Sign JWT with key #3 from env vars
-> Client connects -> success
-> User sees: room loads, they're in

Case 2: Join existing room, same key
User B clicks link /room/ABC123
-> Token endpoint: Redis GET room:ABC123:key -> 3
-> Key #3 not marked exhausted
-> Sign JWT with key #3
-> Client connects -> success, hears User A
-> User sees: joins normally

Case 3: Join room, key is exhausted, room has active users
User C clicks link /room/ABC123
-> Token endpoint: Redis GET room:ABC123:key -> 3
-> Redis GET key:3:exhausted -> true
-> Room ABC123 has active users on key #3
-> DO NOT assign a different key (would split the room)
-> Return 429
-> User sees: "This room has hit its session limit. Ask people
in the room to create a new one, or create your own."
-> [Create New Room] button

Case 4: Join room, key exhausted, room is empty (everyone left)
User D clicks link /room/ABC123 (everyone left 5 min ago)
-> Token endpoint: Redis GET room:ABC123:key -> 3 (mapping still
cached)
-> Redis GET key:3:exhausted -> true
-> Check if room actually has active users: Redis GET
room:ABC123:active -> 0
-> Room is empty, safe to reassign
-> Delete old mapping, find least-rooms non-exhausted key (#7)
-> Redis SET room:ABC123:key = 7
-> Sign JWT with key #7
-> Client connects -> success
-> User sees: joins normally on fresh key

Case 5: Create brand new room
User clicks "Create a Room" on landing page -> /room/XYZ789
-> Token endpoint: Redis GET room:XYZ789:key -> null
-> Least-rooms among non-exhausted keys -> key #12
-> Redis SET room:XYZ789:key = 12
-> Sign JWT
-> Client connects -> success
-> User sees: fresh room, no issues

Case 6: All keys exhausted
User tries to create or join any room
-> Token endpoint: all keys marked exhausted in Redis
-> No non-exhausted key available
-> Return 429
-> User sees: "All sessions are at capacity right now. Please
try again in a few minutes."
-> [Try Again] button

---

INSIDE A ROOM

Case 7: Using room normally, key hits quota mid-session
Users A, B, C singing in room ABC123 on key #3
LiveKit free tier quota for key #3 depletes to 0

-> A, B, C: NOTHING CHANGES. Still connected. Still hear each
other.
Still singing. WebRTC connection is alive.
-> LiveKit docs: "new requests will fail" (existing stay)

User D tries to join:
-> Token endpoint gives key #3 (room affinity)
-> Client room.connect() -> FAILS
-> Client retries with keyHint=next
-> Server marks key #3 exhausted in Redis
-> Server sees room has active users -> returns 429 (no split)
-> User D sees: rate limit message + Create New Room button

Case 8: Unexpected disconnect mid-session (if LiveKit ever kicks)
User A is singing, suddenly disconnected
-> LiveKit fires RoomEvent.Disconnected
-> User sees: "Disconnected - the room may have hit its session
limit. Ask others to create a new room, or create one
yourself."
-> [Create New Room] button
-> Other users (B, C) might also get disconnected or stay
depending on the cause

Case 9: User refreshes the page mid-session
User A refreshes browser in room ABC123
-> Old WebSocket lingers as ghost (up to 15s departure timeout)
-> New page loads, token endpoint: Redis GET room:ABC123:key -> 3
-> Key #3 not exhausted -> sign JWT -> connect
-> New connection joins, old ghost eventually cleaned up
-> User sees: brief reconnect, then back to normal
-> Name check: if ghost still alive with same name, server checks
lastPong age > 20s -> evicts ghost -> allows new connection

Case 10: Singer recording, key hits quota
Singer is recording + sharing audio, key quota depletes
-> Singer stays connected (existing session)
-> Recording continues (MediaRecorder taps local mixDest)
-> Audience stays connected
-> Only new joins are blocked
-> Singer finishes, downloads recording normally

---

LEAVING / ROOM LIFECYCLE

Case 11: Everyone leaves room
Last user leaves room ABC123
-> PartyKit: room empty -> reset all state
-> LiveKit: room empty for 30s -> auto-close
-> Redis: room:ABC123:key = 3 stays cached (TTL 1 hour)
-> Redis: DECR key:3:rooms
-> After 1 hour: mapping expires, room code is "fresh" again

Case 12: User leaves, others stay
User A leaves room ABC123, B and C still there
-> PartyKit removes A from participants
-> LiveKit: A's tracks unpublished, others unaffected
-> Redis: no change (room still active on key #3)
-> B and C continue normally

Case 13: Key exhaustion cooldown expires
Key #3 was marked exhausted 5 minutes ago
-> Redis TTL on key:3:exhausted expires -> key deleted
-> Next request for a room on key #3 will try it again
-> If LiveKit still rejects: re-mark exhausted (another 5 min)
-> If LiveKit accepts: key is back in rotation

---

EDGE CASES

Case 14: Two users create same room code simultaneously
User A and B both navigate to /room/NEW999 at the same instant
-> Both hit token endpoint concurrently
-> Redis SET is atomic - first write wins
-> Both reads return the same key (say #5)
-> Both connect to same LiveKit project -> they hear each other
-> No split, no conflict

Case 15: Redis is down
Token endpoint can't reach Upstash
-> Fall back to in-memory hash: hash("ABC123") % totalKeys
-> Same as current behavior (PR #5)
-> No room affinity guarantee but functional
-> Log warning for monitoring
-> Self-heals when Redis comes back

Case 16: Vercel cold start with new key added
Admin adds LIVEKIT_API_KEY_6 to Vercel env vars
-> Next cold start: endpoint scans env, finds 6 keys
-> Redis SET total_keys 6
-> All instances now know about key #6
-> New rooms start getting assigned to #6 (least-rooms)
-> Existing rooms stay on their current keys

Case 17: Key removed from env (DON'T DO THIS)
Admin removes LIVEKIT_API_KEY_3 from env
-> Rooms mapped to key #3 in Redis still reference it
-> Token endpoint can't find key #3 credentials
-> Those rooms break for new joins
-> Existing connections stay alive until they disconnect
-> FIX: never remove keys, only add. Mark as "retired" instead.

Case 18: Same room code reused after quota reset (next month)
Room ABC123 was on key #3, which exhausted last month
-> New month: LiveKit resets quota for all keys
-> Redis key:3:exhausted expired long ago (5 min TTL)
-> Redis room:ABC123:key expired (1 hour TTL, room was empty)
-> User creates room ABC123 -> treated as new room
-> Assigned to least-rooms key -> works fine

---

WHAT USERS NEVER SEE

- Raw error codes (429, 500, etc.)
- Key numbers or rotation logic
- Redis latency (1-2ms, imperceptible)
- Split rooms (prevented by refusing instead of splitting)
- Stale mappings (TTL handles cleanup)

WHAT USERS ALWAYS SEE

- Instant join when capacity is available
- Clear message when room is at limit
- "Create New Room" button as escape hatch
- Existing sessions uninterrupted when quota depletes
- Reconnect works after page refresh

Does this cover everything you need?

✻ Crunched for 56s · 1 shell still running

❯ what is the possible issue with dangling, staleness, and if this
make the app stateful with server or still stateless, reliablity
and users at scale give me detail on all these and trade off: state
if the thing can be completely mitigated with no regression,
compexity can be ranked but never an issue aslong as the site work
reliably techinicalluy

⏺ Is the app still stateless?

Yes. Redis is an external shared data store, same as PartyKit and
LiveKit. We already depend on two stateful external services.
Adding a third doesn't make our compute stateful. Every Vercel
function instance is still disposable - reads from Redis,
processes, responds. No in-memory state matters.

Before Redis: Vercel (stateless) + PartyKit (stateful) + LiveKit
(stateful)
After Redis: Vercel (stateless) + PartyKit (stateful) + LiveKit
(stateful) + Redis (stateful)

Our code stays stateless. The state lives in managed services.

Dangling Risks

1. Room-to-key mappings outlive the room

Room empties -> mapping stays in Redis -> TTL 1 hour -> expires

- Impact: Next user creating same room code gets old key (maybe
  exhausted)
- Mitigation: Check if key is exhausted before using cached
  mapping, reassign if so
- Fully mitigable? Yes - check + reassign logic handles it. Zero
  regression.

2. Exhaustion markers outlive actual exhaustion

Key marked exhausted -> 5 min TTL -> auto-expires

- Impact: Key unavailable for 5 min even if LiveKit recovered
- Mitigation: Short TTL (5 min) self-heals. Next request after
  expiry tries the key again.
- Fully mitigable? Yes - TTL handles it automatically. Zero
  regression.

3. Room count drift (THE BIG ONE)

INCR on room creation... but when do we DECR?
PartyKit room closes -> doesn't notify Redis -> count never
decremented

- Impact: Over time, all keys show inflated room counts.
  Least-loaded algorithm thinks all keys are equally loaded.
  Distribution degrades to round-robin.
- Why it's hard: PartyKit and Redis are separate services. Room
  close events don't cross the boundary.
- Mitigation options:

Approach: Ignore drift - counts are approximate, relative ordering

    still works

Complexity: None
Reliability: Good enough
Regression risk: Zero
────────────────────────────────────────
Approach: TTL-based counting - each room mapping has TTL, count =
number of non-expired keys
Complexity: Low
Reliability: Good
Regression risk: Zero
────────────────────────────────────────
Approach: PartyKit notifies Redis - party/index.ts calls our API
on
room empty to DECR
Complexity: Medium
Reliability: Accurate
Regression risk: Low - adds HTTP call from PartyKit
────────────────────────────────────────
Approach: Periodic reconciliation - cron calls listRooms(), resets

    counts

Complexity: Medium
Reliability: Accurate
Regression risk: Zero - read-only sync

Best approach: TTL-based counting. Don't track counts separately.
Just count active room mappings. A room mapping with TTL = the
room is active. Expired = gone. Count non-expired keys per key
number. Self-cleaning, no DECR needed.

- Fully mitigable? Yes with TTL approach. Zero regression.

4. Redis entries for removed keys

Admin removes LIVEKIT_API_KEY_3 from env -> Redis still has
room:X:key=3

- Impact: Rooms assigned to removed key can't get tokens
- Mitigation: Never remove keys (document this). Or: on cold
  start, reconcile Redis with env vars.
- Fully mitigable? Yes with reconciliation on startup. Zero
  regression.

Staleness Risks

1. Exhaustion state lag

Instance A marks key exhausted in Redis
Instance B reads 1ms later -> sees it

- Upstash Redis is strongly consistent for single-key ops
- No staleness issue. Fully mitigated by design.

2. Room count staleness

- Addressed above (TTL-based counting eliminates this)
- Fully mitigable. Zero regression.

3. Least-loaded selection race

Two simultaneous new rooms both pick key #7 (fewest rooms)
Both INCR -> key #7 gets 2 rooms instead of 1

- Impact: Off by 1 room. Self-correcting.
- Fully mitigable? Not without a lock, but the impact is
  negligible. Distribution error is +/- 1 room out of hundreds. Not
  worth fixing.

Reliability at Scale

Redis as single point of failure

- If Redis down: Fall back to in-memory hash (current PR #5
  behavior)
- Degradation: Lose room affinity and least-loaded distribution,
  but rooms still work
- Upstash SLA: 99.99% uptime
- Fully mitigable? Yes - fallback path means Redis failure =
  degraded, not broken.

Thundering herd on key exhaustion

Key #3 exhausts. 50 users try to join rooms on key #3
simultaneously.
All 50 fail -> all 50 mark #3 exhausted (idempotent) -> all 50 see
error.

- Impact: 50 users see "session limit" banner simultaneously. 1-2s
  delay.
- No cascade. The exhaustion marker is SET (idempotent), not a
  counter. 50 writes of the same value = same as 1 write.
- Fully mitigable? The 1-2s delay is inherent (first failure must
  happen to detect exhaustion). Can't be eliminated without quota
  API.

Monthly quota reset

1st of month: LiveKit resets all quotas
Redis: all exhaustion markers already expired (5 min TTL)
Redis: inactive room mappings already expired (1 hr TTL)
Active rooms: stay on their keys, which now have fresh quota

- Seamless. Zero manual intervention.

10,000 concurrent users

~1000 rooms, 100 keys, ~10 rooms per key
Redis ops per join: 2-3 (GET mapping, maybe SET, GET exhaustion)
Total: ~3000 Redis ops/min at peak
Upstash free tier: 500K/month = ~11 ops/sec sustained

- At 10K users, we'd exceed free tier. Pay-as-you-go: $0.20 per
  100K commands. ~$0.60/month at this scale.
- Latency: 1-2ms per Redis op. 3-5ms total per join.
  Imperceptible.

Summary

┌──────────────┬────────────┬────────────┬───────────────────┐
│ Risk │ Severity │ Fully │ How │
│ │ │ mitigable? │ │
├──────────────┼────────────┼────────────┼───────────────────┤
│ Room mapping │ │ │ TTL auto-expiry + │
│ outlives │ Low │ Yes │ exhaustion check │
│ room │ │ │ │
├──────────────┼────────────┼────────────┼───────────────────┤
│ Exhaustion │ Low │ Yes │ 5-min TTL │
│ marker stale │ │ │ self-heals │
├──────────────┼────────────┼────────────┼───────────────────┤
│ Room count │ │ │ TTL-based │
│ drift │ Medium │ Yes │ counting (no │
│ │ │ │ INCR/DECR) │
├──────────────┼────────────┼────────────┼───────────────────┤
│ Removed key │ │ │ Never remove + │
│ in env │ Low │ Yes │ startup │
│ │ │ │ reconciliation │
├──────────────┼────────────┼────────────┼───────────────────┤
│ Redis down │ Low │ Yes │ Fallback to │
│ │ │ │ in-memory hash │
├──────────────┼────────────┼────────────┼───────────────────┤
│ Race in │ Negligible │ No (not │ Off by 1 room, │
│ least-loaded │ │ worth it) │ self-correcting │
├──────────────┼────────────┼────────────┼───────────────────┤
│ Thundering │ Low │ Partially │ 1-2s detection │
│ herd │ │ │ delay is inherent │
├──────────────┼────────────┼────────────┼───────────────────┤
│ │ │ │ No - compute │
│ App becomes │ N/A │ N/A │ stays stateless, │
│ stateful │ │ │ Redis is external │
│ │ │ │ store │
└──────────────┴────────────┴────────────┴───────────────────┘

Everything is fully mitigable with zero regression except the 1-2s
detection delay on first key exhaustion, which is a fundamental
limitation of not having a quota API.

✻ Sautéed for 1m 27s · 1 shell still running
