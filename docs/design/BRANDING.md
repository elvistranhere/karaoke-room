> **DECISION (Elvis, 2026-08-18): the name stays Karaoke Now.** The shortlist below is kept as a record. The keep-the-name path in section 4 is the operative guidance; `com.karaokenow.app` stays as the bundle ID and is no longer a concern since name and ID now agree.

# Branding and Naming: a decision document

**Status:** proposal. Nothing here is decided. Every recommendation is argued so Elvis can disagree with the argument rather than the conclusion.

**Screens run 18 August 2026** by direct API and page fetches (Apple iTunes Search API across US/AU/VN storefronts, RDAP for `.com`/`.app`/`.co`, live HTTP fetches). Domain and store results are collision screening, **not trademark clearance**. USPTO and IP Australia registers were not searched.

**Correction to earlier research, carried at the top because it changes the recommendation:** an earlier pass reported `zomic.com`, `microom.com` and several others as available based on absent DNS delegation. That is a false signal. RDAP is authoritative and says otherwise: `zomic.com` has been **registered since 2004-08-16, renewed 2026-08-16, on Network Solutions nameservers**. It is taken. Almost every `.com` on the shortlist is taken. See the table.

---

## 1. The honest read on "Karaoke Now"

### What the name buys

**Instant comprehension, at zero explanation cost.** Nobody has ever asked what this product does. For a product spread by a six-character code pasted into a group chat, where the recipient arrives already told what they are joining, comprehension is most of the naming job and the name does it perfectly.

**Partial keyword credit.** The category word is in the title. Someone typing "karaoke" into a search bar or a store is a qualified lead, and title-token matching is the heaviest weighted field in both app stores.

**It is already shipped and already working.** `karaokenow.co` is deployed, canonical, and three other hostnames 308-redirect into it. The OG card, the PWA manifest, the SEO copy and the store identity all agree. That coherence has real value and a rename spends it.

**It has not hurt yet.** Honest accounting: there is no evidence in hand that the name has cost a single room. The case for changing it is forward-looking, not remedial.

### What the name costs

**1. The `.com` is a live competitor in the same category.** `karaokenow.com` resolves today (fetched 18 Aug 2026, HTTP 200) to **"KaraokeNow!"**, a karaoke equipment retailer and rental business at 19th Avenue #13, Phoenix, AZ 85021, selling karaoke microphones, mixers, speakers, players and rentals. Same name, same word, same industry, senior use, and they hold the canonical domain in the primary market for app stores.

This is the single worst fact about the current name, and it is worse than a lost domain. It closes the upgrade path permanently, it sends every verbal referral ("karaokenow dot com") to a microphone store, and it puts a senior same-class user on the other side of any trademark filing. Everything else in this section is a matter of taste. This one is structural.

**2. The mark is descriptive, which is close to unprotectable.** Under the *Abercrombie* spectrum, descriptive marks require proof of secondary meaning before they register: years of documented use, sales and usually survey evidence. "Karaoke Now" is descriptive at best and arguably generic-plus-temporal. Practically: a competitor can use the phrase "karaoke now" descriptively forever and there is nothing to be done about it. Apple's own product page guidance says to choose a distinctive name and "avoid generic terms." A name that cannot be defended is a name that cannot become an asset.

**3. The category is morphologically saturated, and descriptive names are invisible in it.** The US App Store returns 171 results for `karaoke`; 120 of them contain the string "kara" and 31 contain "sing". The `karaoke now` query today returns StarMaker, SingWow (Hát Kara & Hát AI), Yokara, Hakara, Karaoke Songs, Yokee, StarMaker Lite, IKARA, Smule, Sing by Stingray, HappyVV. A descriptive name does not outrank funded incumbents with years of ASO. It just fails to be distinguishable from them.

Note one favourable fact inside this: **no App Store app is actually titled "Karaoke Now"** in US, AU or VN results. The store title is claimable. But a claimable generic is a weak asset.

**4. It describes the wrong product, and caps it.** The thing being built is a hangout room with synced video, live voice, per-person volume and a song-reactive atmosphere. "Karaoke Now" promises a karaoke machine. Discord is not called "Voice Chat Now." Every ambition past karaoke rooms (public rooms, browse, general hangout, app stores) has to fight the name.

**5. It has a grammar problem, not just a vibe problem.** The name is an adverbial phrase. It cannot complete "I'm in ___" or "open a ___" or "see you in ___." Hangout positioning needs a place-noun that takes those sentences. This is probably the real source of the discomfort.

**6. "Now" is a dated suffix.** Now / Live / Pro / Plus reads 2011 store-SEO. It fights the Baloo 2, dark-violet, playful-but-polished identity that already exists and is genuinely good.

### The bar a replacement must clear

A replacement is only worth the switching cost if it beats "Karaoke Now" on **all** of these. Any candidate that fails one is not an improvement, it is a lateral move with a migration bill attached.

| # | Criterion | Why it is on the list |
|---|---|---|
| 1 | **Ownable**: coined or arbitrary, not descriptive; no same-class senior user found in screening | The whole point. Fails here and the rename bought nothing. |
| 2 | **`.com` obtainable** at a price Elvis will actually pay, or genuinely unregistered | The current name's fatal flaw. Repeating it is unforgivable. |
| 3 | **Store title clear** in US, AU and VN | VN matters because the current audience is there and the "kara" cluster is dense in that storefront. |
| 4 | **Said correctly first try in English and Vietnamese** | Vietnamese permits only /w/ in onset clusters and only /p t k m n ŋ/ as codas. Smule (/sm/ onset, /l/ coda), StarMaker (/st/ + /r/) and KaraFun (/f/ coda) are all awkward for the current audience. A name legal in both phonologies is an unclaimed opening. |
| 5 | **Spellable on hearing** | Distribution is verbal and via pasted links. A spelling tax on every referral compounds. |
| 6 | **Works as a place-noun** | Must complete "I'm in ___", "open a ___". |
| 7 | **Survives the product growing past karaoke** | Discord was gaming-shaped for five years (public launch May 2015) and repositioned in June 2020 without a rename, because the name never said "gaming". That option has to stay open. |
| 8 | **Fits the existing identity**: dark violet, song-reactive hue, waveform ring, Baloo 2 | The visual identity is the strongest asset in the brand today. The name should not fight it. Baloo 2 is round and warm, which favours rounded, voiced, open-syllable names over hard consonant clusters. |
| 9 | **Two syllables or fewer where possible, ≤ 12 characters** | App Store name field is 30 characters and must also carry a descriptor: `<Brand>: Karaoke Rooms with Friends` needs the brand to be short. Also, fluent names are liked more; processing fluency raises evaluation and familiarity independent of content. |
| 10 | **Loses nothing on ASO** | Recoverable via the subtitle, but must be recovered deliberately, not assumed. |

One structural note: **criterion 10 is cheap to satisfy.** Smule shipped 8 Aug 2012 as "Sing! Karaoke" and renamed to "Smule" once it had recognition to carry the name. StarMaker, Smule and KaraFun all run `Brand: keyword descriptor` in the title today. The store title `<Brand>: Karaoke Rooms with Friends` recovers every keyword "Karaoke Now" currently provides. The keyword argument is not a reason to keep a descriptive brand.

---

## 2. Positioning recommendation

### The territories considered

- **A. Party-first** (the occasion is the product): "Karaoke night, one link away." Highest click-through, clearest trigger, easiest to explain. But occasion positioning produces event-shaped retention, undersells the atmosphere layer and per-person volume, and invites the Houseparty comparison: a product that exists only for the occasion dies when the occasion is inconvenient.
- **B. Hangout-first** (the room is the product): the Discord frame applied to the one thing Discord cannot do well.
- **C. Stage-first** (the performance is the product): "Your voice, your stage." This is Smule's lane, held since 2012, with an owned catalogue, scoring, duets and recorded artifacts. This product structurally cannot compete there: YouTube gives no audio access, so full-mix recording and scoring against a reference track are impossible by design (see `docs/design/KARAOKE-PRIOR-ART.md`). Stage-first writes a cheque the architecture cannot cash, and it repels the exact user who is here **because** nobody is judging them.
- **D. Vietnamese-diaspora-first**: strong as a beachhead, weak as a brand. If the brand is Vietnamese-first, store discovery and general broadening get hard.

### Recommendation: Territory B as the master position, with the others as layers

**Master position (brand, product, retention): hangout-first. The room is the product, not the stage.**

The reasoning, in order:

1. **The three real differentiators map onto it exactly.** Rooms feel like hanging out rather than performing (that is the whole position). A code and a link with zero setup (that is the proof of "hop in"). The room reacts to the song (that is what makes it a place rather than a call). No other territory uses all three.
2. **It is retention-shaped, not event-shaped.** Party-first wins the first open and loses the Tuesday.
3. **It is the only territory where "not Smule" is the point rather than a defensive footnote.** BeReal built a company on "won't make you famous." The equivalent wedge here is explicit: Smule sells getting good, this sells not caring.
4. **It ages into app stores and general consumer without a repositioning.** Discord's name emptiness is what made both of its pivots free.
5. **It justifies every audio and atmosphere investment already made**, which is where the engineering effort has actually gone.

**Where it breaks, honestly.** It sets up a direct "why not just Discord and share screen" comparison, so the copy has to answer fast: synced playback that stays in sync, live voice over the music, your own volume for every person. And it makes a promise about presence. **If rooms are empty when you open one, "hang out" is a lie.** Adopting this position promotes public rooms and browse from nice-to-have to positioning-critical.

**The layered stack (this is what Discord actually ran, not a single position):**

- **Master (brand, product, retention):** hangout-first. The room is the product.
- **Acquisition (campaigns, share previews, seasonal):** party-first. Sell the occasion to earn the first open. The Open Graph card is seen more often than the landing page, because distribution is a link in a group chat. That surface should carry the party line.
- **Beachhead channel (year one):** Vietnamese-diaspora-first. Culture-specific marketing, seeding and localised pages; culture-neutral name and store subtitle. Be Vietnam Pro and the Vietnamese font subsets are already shipped, which is a real asset.
- **Feature story (inside the room, never the headline):** stage-first. Voice effects and the song-reactive atmosphere as production value for whoever has the mic.

### The one-line pitch

> **A room where your friends sing. Send a code, that's it.**

Fourteen words, states the place-noun, states the zero-friction proof, and does not use the word "karaoke" in the pitch while the store subtitle still does.

Supporting ladder:

- **3 to 5 words** (store subtitle, 30 char cap, icon lockup): `A room where friends sing` (25 chars). Compare with the current `Sing Together Online`, which spends the most valuable 30 characters on a category term.
- **25 to 35 words** (store description opener, meta description): *"Open a room, send the code, and sing together in your browser. Synced YouTube, live voices, your own volume for every person, and a room that changes colour with the song. Free, no signup."*
- **Anti-position** (press, About, internal alignment): *"Smule is for people who want to sound good. This is for people who want to be in the same room."*
- **Internal positioning statement:** For friend groups who want to sing together without being in the same house, this is a drop-in room, not a performance app. Unlike Smule and Sing-style apps, which score, record and rank you, and unlike a Discord screen share, which cannot keep music in sync or give you your own volume for each person, it makes a room that feels like hanging out.

### Three tagline options

| # | Tagline | Register | Argument for | Argument against |
|---|---|---|---|---|
| 1 | **"A room where your friends sing."** | Warm, declarative, place-noun | Purest expression of the master position. States the noun, implies the people, sells no feature. Survives every future product direction. Reads well under a wordmark in Baloo 2. | Passive. Says nothing about how easy it is, which is the strongest single claim the product has. Needs the second line to carry it. |
| 2 | **"Send the code. Start the night."** | Imperative, party-first | Best acquisition line in the set. Two verbs, a mechanic and an occasion. Ideal for the OG card and the share preview, which is the surface most people actually see. | Occasion-shaped, so it is the wrong line for the brand mark itself. Use it in campaigns, not on the logo lockup. |
| 3 | **"Bad singing encouraged."** | Dry, anti-performance | The wedge as a joke. Instantly separates from Smule and every scoring app, gives permission (the actual emotional job the product does), and is the most repeatable line here. Very Discord in register. | Undersells the technical achievement, and reads as self-deprecating about quality in a product whose real differentiator is that it sounds right. Best as a secondary line, on the empty-room state or the About page, not as the primary. |

Recommendation: **#1 as the brand line, #2 on share previews and campaigns, #3 as the personality line in-product.** They are different layers, not competing options.

**Cheap validation before committing:** run one headline per territory as the landing headline against the existing PostHog funnel (`docs/design/ANALYTICS.md`), measured on **room-created and second-participant-joined**, not on clicks. The party line will win clicks and probably lose rooms, and measuring clicks would hide that.

---

## 3. The shortlist

Twelve candidates that survived screening. Roughly 46 were generated; the kills are listed after the table with cause, because knowing what is dead is worth as much as the shortlist.

**How to read the columns.** `.app` results are authoritative Google Registry RDAP as of 18 Aug 2026 (404 = unregistered). `.com` results are Verisign RDAP with nameservers inspected, which is what caught the earlier false-availability reading. `.co` is GoDaddy Registry RDAP. Store screen is exact-name and name-prefix matching against the iTunes Search API in US, AU and VN storefronts.

| # | Name | Style | Story | EN / VI pronounceability | Store screen (US/AU/VN) | Domain reality | Identity fit |
|---|---|---|---|---|---|---|---|
| 1 | **Zomic** | Coined (zô + mic) | "Một hai ba, dzô!" is the toast that runs every Vietnamese party. Insiders get it instantly, outsiders hear a clean two-syllable tech name and lose nothing. | ZOH-mik. Unambiguous both languages. No cluster, legal VN coda /k/. | **Clear**, zero matches in all three storefronts | `.app` free, `.co` free. **`.com` TAKEN**: registered 2004-08-16, renewed 2026-08-16, Network Solutions NS, does not resolve. Dormant holder, so acquirable in principle but not listed for sale and not cheap. | Excellent. Round, warm, sits well in Baloo 2. One letter from "comic"/"atomic" in noisy voice search. |
| 2 | **Karaoken** | Coined (karaoke + token; a room code *is* a token) | The only candidate that describes the mechanic: a karaoke room entered with a token. | kara-OH-ken. Trivial in both, since "karaoke" is a loanword in both. | **Clear** in all three | `.app` free, `.co` free. `.com` on **Atom brokerage** nameservers, so purchasable at a listed brandable price. | Good. Longer (8 chars) but fine. Contains the category word, so it sits nearer the Hakara / Yokara / IKARA cluster than a fully coined mark. |
| 3 | **Oiroom** | Compound (ơi + room) | "Ơi" is the Vietnamese vocative, calling out to someone, which is exactly what joining a room is. Doubles as the Australian "oi", which lands precisely on a Viet-Australian audience. | Fragile. Written form splits as "oi-room" or "oir-oom". Spoken it is fine. | **Clear** in all three | **`.com` and `.app` and `.co` all genuinely unregistered.** The only candidate here that clears all three. | Good conceptually, weak typographically. Commits hard to a bilingual joke that will not travel to a general market. |
| 4 | **Novoke** | Coined (novo + voke) | Reads as "new voice", "invoke", "provoke". The most grown-up-sounding candidate; scales to general consumer without looking like a toy. | noh-VOKE. Clean in EN, fine in VI. | **Clear** in all three | `.app` free, `.co` free. `.com` **registered 2020, on Bluehost, in use**. | Good but cool rather than warm. Carries zero Vietnamese warmth, which is a real loss for the beachhead. |
| 5 | **Roomoke** | Compound (room + oke) | Says "room" first and karaoke second, which is the positioning in one word. | roo-MOH-kee. Legal in both; VN reads "ru-mô-kê" without trouble. | **Clear** in all three | **`.com` and `.app` both unregistered.** | Fair. The `-oke` truncation cohort (SnapOke, KraOK, GoKarao) reads 2012, which is the main strike against it. |
| 6 | **Nightmic** | Compound | Karaoke is a night activity, and "night" carries the dark violet identity for free. | "night" is the harder half for VI speakers (/t/ coda is legal, the diphthong is not native). | **Clear** in all three | `.app` free, `.co` free. `.com` on **Atom brokerage**. | Strong. Directly evokes the palette. But it is a mood, not a place. |
| 7 | **Glowmic** | Compound | Encodes the song-reactive atmosphere, which is the actual differentiator no competitor has. | Clean in EN; /gl/ onset is illegal in VI. | **Clear** in all three | `.app` free, `.co` free. `.com` on **Afternic**. | Very strong on identity, weaker as a brand. "Glow" is heavily used in wellness and beauty apps. |
| 8 | **Melodo** | Coined | Warm, musical, obvious. The -o ending sits beautifully under Baloo 2. | Trivially correct in both languages. Best pure pronounceability in the set. | **Clear** in all three | `.app` free, `.co` free. `.com` on **BrandBucket**. | Excellent visually. Weakest distinctiveness: melody-roots are everywhere in music tech and it names music, not a room. |
| 9 | **Singhouse** | Compound | "The place where singing happens." "House" carries hangout connotation. | Fine in EN. /s/+/ŋ/ and the /s/ coda are awkward in VI. | **Clear** in all three | `.app` free, `.co` free. `.com` on **Afternic**. | Warm and place-shaped. But "Sing" is the second most contested token in the category (31 of 171 store results) and "house" is claimed by the music genre. |
| 10 | **Zoroom** | Compound (zô + room) | Zomic's cultural payload with a clearer room signal. | The doubled o-oo is clumsy to say and to type. | **Clear** in all three | `.app` free, `.co` free. `.com` on **Squadhelp** brandable listing. | Fair. The idea is better than the word. |
| 11 | **Karaoki** | Coined (misspelling) | Cute respelling that keeps keyword value. | Correct on sight in both languages. | **Clear** in all three | `.app` free, `.co` free. `.com` on **Sedo** parking. | Fair. Deliberate misspellings carry a permanent spelling tax on every verbal referral, and this is the closest of all candidates to the existing VN karaoke cluster. |
| 12 | **Micster** | Coined | Playful, unmistakably a mic product. | Clean in EN, /st/ + /r/ illegal in VI. | **Clear** in all three | `.app` free, `.co` free. `.com` on **GoDaddy** parking. | The -ster suffix reads Napster/Friendster. That may be the retro-warm feeling you want or may just read dated. |

### Ranking

1. **Zomic** 2. **Karaoken** 3. **Oiroom** 4. Novoke 5. Roomoke 6. Melodo 7. Nightmic 8. Glowmic 9. Singhouse 10. Zoroom 11. Karaoki 12. Micster

### The top three, argued

#### 1. Zomic

It is the only candidate that is simultaneously store-clear in all three markets, pronounced identically by an English and a Vietnamese speaker on first hearing, short enough to leave 24 characters for a descriptor in a 30-character store title, and carrying a culturally specific meaning that **rewards insiders and costs outsiders nothing**. That asymmetry is exactly what a crossover name should do. "Dzô" is the sound of the room this product is trying to be: the toast, everyone shouting at once, nobody performing. It is coined, so it is registrable as an arbitrary mark rather than needing secondary meaning, and it will rank first for its own name from week one. Round, voiced, two syllables, no cluster, legal Vietnamese coda. Baloo 2 will make it look like a toy in the good way.

**The problem, stated plainly:** `zomic.com` is registered and has been since 2004. The holder sits on Network Solutions nameservers, the domain does not resolve, and the registration was renewed two days ago, which reads as a long-term passive holder rather than a flipper with a price sheet. That means a broker approach with an uncertain outcome and possibly a four-to-five-figure number, or launching on `zomic.co` and `zomic.app`. Launching without the `.com` is survivable (Discord ran on discordapp.com for years) but it is the exact weakness that makes the current name untenable, and repeating it knowingly deserves a hard second thought. Get a broker quote **before** committing, not after.

#### 2. Karaoken

The hedge, and the only candidate that keeps meaningful keyword value while still being ownable. It contains "karaoke" as a substring, so it picks up partial store keyword matching, but it is a coined word, so it is registrable and defensible in a way "Karaoke Now" never will be. The token double meaning is genuinely good: a room code *is* a token, so the name describes the mechanic rather than the category. It is store-clear in all three markets, and both the `.app` and `.co` are free, with the `.com` sitting on a brokerage where a price exists and can be paid.

**Argue against it:** it names the karaoke, not the hangout, which is the exact failure mode identified in criterion 7. It keeps the product tethered to one activity, and it sits phonetically inside the Hakara / Yokara / IKARA cluster, so it inherits some of the invisibility problem it was meant to solve. Choose this one if you decide the ASO argument beats the brand argument, and know that you are choosing a good five-year name over a good fifteen-year name.

#### 3. Oiroom

The dark horse, and it wins the one criterion that killed the current name outright: **`oiroom.com`, `oiroom.app` and `oiroom.co` are all genuinely unregistered.** Nothing else on the list clears all three. The concept is the best on the list too. "Ơi" is a call to a person, which is what a room invitation is, and the collision with the Australian "oi" is not a coincidence you can engineer twice for a Viet-Australian audience. It is a place-noun, it takes "I'm in Oiroom", it costs about forty dollars in total to secure the entire namespace today.

**Argue against it:** the written form is genuinely ambiguous (oi-room or oir-oom), which violates criterion 5, and the bilingual joke will not travel to a general Western audience the way Zomic's does, because the payload is in the spelling rather than the sound. A wordmark that visually separates the halves would fix the first problem and not the second. Take this one if the "must own the whole namespace on day one" argument outranks everything else, which is a defensible position given how the current name failed.

### Killed, with cause

Worth recording so these are not re-proposed.

| Name | Cause of death |
|---|---|
| Microom | Store screen returns **"Mic Room"** and **"Mic Room LE"** (Lexicon). Same phrase, adjacent audio category. Also misparses as "mi-croom" or a typo of "micro". |
| MicDrop | "MicDrop: Freestyle Karaoke" and "MicDrop: Karaoke Tracker" both live. Same category, same name. |
| Riff | 11+ prefix matches including **"RIFF: Live Music With Friends"**. Directly adjacent product. |
| Okara | "Okara - Karaoke không giới hạn" is a live karaoke app in exactly the target market. |
| Voxa | 12+ store apps ship as Voxa. `voxa.app` on Squadhelp. |
| Encore | 13+ prefix matches. Generic music word, hopeless to own. |
| Hangtime | "HangTime: Let's Hang" and "Hangtime - Make Plans Quick", both social hangout apps. |
| Echora | Four exact-name apps, both domains delegated. |
| Anthem, Lantern | Store screens came back clear, which is a screen artifact. Anthem is a US health insurer with a large portfolio plus a BioWare game; Lantern is a well-known VPN. Killed on judgment. |
| Kavo | KaVo Dental GmbH, active trademark. |
| Choira | Choira Musictech ships two apps in the music sector. |
| Vui | "Vui - Chạm là có lương" is a live VN fintech app, and English speakers cannot say it. |
| Vibaoke | Screen-clear and domains free, but pronunciation collapses three different ways. A name that fails its own pronunciation test is not worth a free `.com`. |
| Croon, Falsetto | `.app` registered and delegated for both. Croon was otherwise a nice word. |
| Sungle | Reads as "single" in a social app, which implies dating. |
| Karoom | `karoom.com` on NameFind (GoDaddy's premium arm). |
| Any `kara`-prefixed short form | 120 of 171 store results contain "kara". The morpheme confers zero distinctiveness. |
| `i-` prefixes, `Star-` names, `Now/Live/Pro/Plus` suffixes, `-oke` truncations | Dated cohorts. All read 2010 to 2014. |

---

## 4. The keep-the-name path

This is a real option, not a consolation prize. "Karaoke Now" has one fatal flaw (the Phoenix `.com`) and one strategic flaw (it names the activity). Both can be worked around, and the workarounds are cheaper than a rename. If Elvis decides the rename is not worth the disruption, here is how to make the name carry.

**1. Let the tagline do the differentiating the name cannot.** The name says the category; the line under it must say the product. The current landing copy is one layer too low: *"Sing together, anywhere. No signup needed."* describes the feature set, and it buries the strongest single claim in the product in a subordinate clause. Replace with the hangout line and promote the friction claim:

- Landing headline: **Karaoke Now** / *"A room where your friends sing. Send a code, that's it."*
- Store subtitle (30 chars): `A room where friends sing` (25). Not `Sing Together Online`.
- OG card title and description: the party-first line, because that surface is seen more than the landing page.

This is the highest-leverage change on this entire page and it costs one commit.

**2. Sub-brand the rooms.** The place-noun the brand lacks can live one level down. Rooms are the thing people say sentences about, so give them a name that takes those sentences and let "Karaoke Now" be the company. This is the Discord/Nitro, Slack/Huddle pattern. Candidates: *Booths* ("open a Booth", "I'm in Booth 4B2K9X"), *Rooms* (safe, invisible, does nothing), *Phòng* (VN-native, "mở phòng", excellent for the beachhead and unpronounceable outside it). **Booths** is the pick: it is a karaoke word (a KTV booth), it is a place-noun, it takes every sentence the brand cannot, and it converts the six-character code from a technical artifact into a room number. It also gives you a naming surface to grow into if the rename happens later.

**3. Make the visual identity carry the brand load.** The wordmark is the weakest asset and the atmosphere is the strongest, so shift the weight. Specifically: the waveform-ring icon should become the primary brand mark, appearing without the wordmark wherever it can (favicon, app icon, room header, loading state, OG card corner), because the ring is distinctive in a way the words are not. The song-reactive hue should be treated as brand identity rather than decoration and shown in every marketing asset, because **no competitor has it** and it is the only thing in the visual system that cannot be copied without building the atmosphere layer. Lock the Neon Pulse violet as the fixed idle brand colour so the identity has a constant, and let the hue shift be the thing people describe when they explain the product to a friend.

**4. Fix the `.com` confusion as far as it can be fixed.** It cannot be fully fixed, and that should be stated plainly. Mitigations: never write the domain without the `.co` (`karaokenow.co`, never "karaokenow"), lead all verbal and written referral with **the room link**, not the domain, and consider acquiring a redirect domain that is unambiguous when spoken.

**5. Accept the ceiling explicitly.** If the name stays, accept that the mark will not be registrable as anything but a descriptive mark with acquired distinctiveness, that a Phoenix karaoke retailer sits senior in the same class, and that the store title will always be a generic in a list of 171 generics. Those are survivable for a friend-group product spread by code. They are not survivable for a general-consumer app-store push. **So the real decision is not "is the name good", it is "which ambition is this."** If the answer is "friend groups, growing organically," keep the name and do items 1 to 3. If the answer is "app stores and general consumer," the rename is not optional and doing it at 10,000 users is far cheaper than at 100,000.

---

## 5. Next steps, either way

### If renaming

1. **Trademark clearance before spend.** No register was searched for this document. Before committing: USPTO TESS (classes 9 and 41), IP Australia, and a Madrid/WIPO Global Brand check. Budget for a paid search on the final one or two names. This is the step that most cheaply prevents the most expensive mistake, and it is the step the current name skipped.
2. **Lock the domains on the shortlist now, before deliberating further.** `.app` and `.co` are ten to thirty dollars each and can be taken by anyone on any day. Registering `zomic.app`, `zomic.co`, `karaoken.app`, `karaoken.co`, `oiroom.com`, `oiroom.app` and `oiroom.co` costs under two hundred dollars total and buys unlimited thinking time. Do this before the rest of this list.
3. **Get a broker quote on `zomic.com`** before falling in love with Zomic. A dormant 2004 registration on Network Solutions may be cheap or may be unreachable, and that number decides between candidate 1 and candidate 2.
4. **Reserve the App Store and Play Store names** as soon as a name clears. App Store name and subtitle are both capped at 30 characters. Reserve the title as `<Brand>: Karaoke Rooms with Friends` (fits, and recovers the ASO the current name provides). App Store Connect lets you reserve a name with a bundle ID before submitting a build; Play requires a listing draft.
5. **Grab the social handles in the same session** as the domains. Same logic, same cost, same risk of being taken while deliberating.

### The rename cost in code, which is genuinely small

The name appears in **15 places** across the codebase. All of them are strings, and none of them is architectural:

| File | What it holds |
|---|---|
| `src/lib/seo.ts` | `SITE_URL`, `SITE_NAME`, `SITE_DESCRIPTION`, `OG_IMAGE.alt` |
| `src/app/manifest.ts` | PWA `name`, `short_name`, `description` |
| `src/components/home/HomeClient.tsx` | wordmark (line 91), SEO body copy (line 320) |
| `src/components/room/RoomView.tsx` | `DEFAULT_TITLE`, the document title template, the header wordmark |
| `src/app/offline/page.tsx` | offline copy |
| `party/index.ts` | `fromName` on outbound mail |
| `public/sw.js` | header comment |
| `src/lib/browser.ts` | header comment |
| `capacitor.config.ts` | `appName`, **`appId`** |

Plus the OG image regenerated with `npm run og`, and the icons.

Half a day of work, one commit, no migration, no data change. **The rename is not blocked by engineering.**

### The one one-way door

> `capacitor.config.ts:4` - `appId: "com.karaokenow.app"`

**Flag this explicitly.** The bundle identifier is the single irreversible decision already made. Once an app ships to the App Store or Play under a bundle ID, that ID is permanent: it cannot be changed on an existing listing, and changing it means a **new listing with zero ratings, zero reviews, zero install base, and no upgrade path for existing users**. Everything else in the table above is a string edit; this one is not.

The good news is that the door is still open, because **nothing has shipped to a store yet** (`docs/plans/2026-08-17-capacitor-status.md`, `docs/design/MOBILE-STACK-DECISION.md`). Right now `com.karaokenow.app` costs nothing to change.

Two consequences that should drive the timing of this decision:

- **Do not submit to any store until the name question is settled.** A store submission converts a reversible decision into an irreversible one, and it is the only deadline that actually exists here.
- **Consider decoupling the bundle ID from the brand regardless of the outcome.** The reverse-DNS ID does not have to match the marketing name; it only has to be unique and stable. If Elvis owns a personal or company domain that will outlive any product name, using it (`com.<something-stable>.karaoke`) means a future rename never touches the one-way door again. This is worth doing even on the keep-the-name path, because it converts the only irreversible item on the list into a reversible one.

### If keeping the name

1. Ship the tagline and subtitle changes from section 4 item 1. One commit, highest leverage on the page.
2. Decide on the **Booths** sub-brand (or reject it) before any store submission, since it changes room-header copy and the code-sharing language.
3. Promote the waveform ring to primary mark and lock the idle violet as the brand constant.
4. Still fix the bundle ID per the note above, and still run at least a knock-out USPTO search so the class-9/41 risk from the Phoenix business is known rather than assumed.
5. Set a revisit trigger rather than leaving it open: **"revisit the name when either a store submission is scheduled or a paid acquisition channel is opened."** Both are moments where a generic name starts costing measurable money.

---

## Verification notes

- All domain results are RDAP as of 18 Aug 2026 and are point-in-time. `.app` and `.co` are cheap and can be registered by anyone on any day; re-check before relying on the table.
- Store screens are exact-name and name-prefix matches only. They do not catch a competitor whose brand appears in the description or in a non-Latin script, and they are not a trademark search.
- No trademark register was searched. Nothing here constitutes clearance.
- The `.com` availability finding corrects an earlier DNS-delegation-based reading. Absence of nameservers is not absence of registration, and the difference changed the recommendation for four candidates.

## Sources

- [KaraokeNow!, Phoenix AZ](https://karaokenow.com) - fetched 18 Aug 2026, HTTP 200, karaoke equipment retailer at 19th Avenue #13, Phoenix, AZ 85021
- [Apple iTunes Search API](https://itunes.apple.com/search) - US, AU and VN storefronts, queried 18 Aug 2026
- [Apple: App Store Product Page](https://developer.apple.com/app-store/product-page/) - 30-character caps on name and subtitle, guidance to avoid generic terms, fetched 18 Aug 2026
- [Verisign RDAP](https://rdap.verisign.com/com/v1/domain/) and [RDAP bootstrap](https://rdap.org/) - queried 18 Aug 2026
- [Smule](https://en.wikipedia.org/wiki/Smule) - shipped as "Sing! Karaoke" 8 Aug 2012, later renamed
- [Discord](https://en.wikipedia.org/wiki/Discord) - public launch May 2015, "Your place to talk" June 2020, "imagine a place" May 2021
- [Houseparty](https://en.wikipedia.org/wiki/Houseparty_(app)) - launched Feb 2016, acquired by Epic June 2019, shut down Oct 2021
- [BeReal](https://en.wikipedia.org/wiki/BeReal) - "BeReal won't make you famous"
- [Partiful](https://partiful.com/) and [Locket](https://locket.camera/) - positioning copy, retrieved 18 Aug 2026
- [Trademark distinctiveness](https://en.wikipedia.org/wiki/Trademark_distinctiveness) - the *Abercrombie* spectrum
- [Processing fluency](https://en.wikipedia.org/wiki/Processing_fluency) and [bouba/kiki effect](https://en.wikipedia.org/wiki/Bouba/kiki_effect) - name sound and liking
- [Vietnamese phonology](https://en.wikipedia.org/wiki/Vietnamese_phonology) - cluster and coda constraints
- Repo: `CLAUDE.md` (Product Principles, Styling and Design Language, Atmosphere Layer), `docs/design/KARAOKE-PRIOR-ART.md`, `docs/design/ANALYTICS.md`, `docs/design/MOBILE-STACK-DECISION.md`
