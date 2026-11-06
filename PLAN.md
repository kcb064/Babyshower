# Baby Shower Registry App — Planning Document

Status: planning only, round 2. No code yet. Section 0 records the decisions made so far; sections 6–8 hold the refined scope, schedule, themes, and remaining questions.

## 0. Decisions so far (2026-11-06)

- **Audience:** one registry, for the owner's own shower on **6 Dec 2026**. Not a multi-tenant product.
- **List style:** curated list chosen by the owner. Each item may optionally carry a store link; guests claim items and buy wherever they like.
- **Surprise mode:** on. Owner sees progress but not who claimed what until reveal.
- **Guest identity:** name and email required to claim. Names hidden from other guests by default; a guest can opt in to showing their name on the item.
- **Payments:** Swish (Swedish mobile payments) for cash funds and group gifts, via personal-number QR / deep link with guest self-report. No card processing.
- **RSVP:** not needed. Invitations handled elsewhere.
- **Editors:** owner, partner, and shower host can all edit.
- **Access:** public link, no password.
- **Hosting:** no custom domain. Either Vercel free tier or the owner's own Docker server.
- **Stack:** no preference; see recommendation in section 6.


## 1. What the market does today

Surveyed Babylist, Amazon, Target, MyRegistry, GiftList, and several self-hosted open-source wishlist apps.

| Capability | Babylist | Amazon / Target | MyRegistry / GiftList | Self-hosted OSS (cmintey/wishlist, Pønskelisten) |
|---|---|---|---|---|
| Add items from any store (universal) | Yes | No (own catalog) | Yes | Yes (URL scraping for title/image/price) |
| Cash funds (diaper fund, college fund) | Yes, ~3% fee | No | Yes | No |
| Group gifting (several guests chip in) | Yes, paid out as store credit | No | Partial | No |
| Purchase tracking across stores | Yes, partly manual ("I bought this") | Automatic in-store | Manual | Manual claim/reserve |
| Anonymous claiming hidden from owner | Partly ("surprise" setting) | No | No | Yes (Pønskelisten) |
| Completion discount | Yes | 10–15% | No | n/a |
| Guest accounts required | No (email only) | Amazon/Target login | No | Varies |

Takeaways:
- Universal "add from any URL" plus a simple claim flow is the core everyone expects.
- The hardest features are money movement (cash funds, group gifting) and automatic purchase detection. Everyone else does these manually or via payment processors.
- Guests strongly prefer no account creation. Owner-side auth is enough.
- "Surprise mode" (owner cannot see who bought what, or that it was bought at all) is a differentiator the big players handle poorly.

## 2. Proposed feature set

### Tier 1 — MVP (the thing has to do this to be a registry)
1. **Owner account & single registry per event.** Email/password or magic link. One owner, optional co-owner (partner).
2. **Registry page with shareable link.** Public, unguessable URL slug. Optional password for the page.
3. **Add item by URL.** Paste a product link; app scrapes title, image, price, store (Open Graph / schema.org). Manual edit fallback. Manual add with no URL.
4. **Item fields.** Name, image, price, store link, quantity wanted (e.g. 6 onesies), priority (must-have / nice-to-have), category (nursery, feeding, bath, clothing, diapering, travel, toys, books, health), owner notes ("any color", "size 0–3m").
5. **Guest claim flow, no login.** Guest enters name + email, clicks "I'll buy this", optionally marks "Purchased" and adds a gift message. Quantity decrements. Soft-reserve with expiry (e.g. 48h) so abandoned claims release.
6. **Owner dashboard.** List of items, claimed/purchased counts, who gave what (unless surprise mode), export CSV for thank-you notes.
7. **Event details block.** Date, time, location/map link, host contact, RSVP link (external or built-in, see Tier 2), theme/colors, cover photo, welcome message.
8. **Mobile-first responsive UI.** Most guests will open this from a text message.

### Tier 2 — Strong additions (what makes it feel finished)
9. **Surprise mode.** Owner sees only aggregate progress; names and purchased status are revealed on a date they choose (shower day) or after the event.
10. **Cash funds.** "Diaper fund", "Nursery fund", "College 529 fund" with goal and progress bar. Phase A: link out to Venmo/PayPal/Zelle handle and let guests self-report. Phase B: Stripe Checkout with real payouts (adds KYC, fees, tax questions).
11. **Group gifting.** Big-ticket items (stroller, crib) with contribution progress bar. Same Phase A/B split as cash funds.
12. ~~Built-in RSVP~~ — dropped (handled elsewhere). Keep an optional mailing-address field on the claim form for thank-you cards.
13. **Thank-you tracker.** Mark each gift as "thanked", merge address from RSVP, print labels.
14. **Email notifications.** Owner: new claim, new RSVP. Guest: claim confirmation with store link, reminder before expiry, event reminder.
15. ~~Multiple registries per account~~ — dropped for v1; schema keeps a `Registry` table so it is cheap to add later.
16. **Starter checklist.** Curated "what you actually need" template by category that owner can bulk-add, then customize.
17. **Price tracking / "still in stock" check.** Nightly re-scrape of product URLs; flag price changes and dead links.

### Tier 3 — Later / differentiators
18. Secondhand / "I'd happily take used" flag per item.
19. Gift arrival tracking: guest pastes tracking number; owner sees shipments.
20. Shower games & photo wall on the same page (guestbook, name predictions, due-date pool).
21. Multi-language and multi-currency.
22. Native app wrapper (PWA first; stores later if ever).
23. Store-affiliate links to offset hosting cost.

### Explicitly out of scope unless you say otherwise
- Own product catalog / inventory / fulfilment.
- Completion discounts (requires retailer partnerships).
- Automatic purchase detection via retailer APIs (Amazon's registry API is closed; realistic path is manual "I bought it").

## 3. Architecture sketch — superseded by section 6

## 6. Refined scope and architecture

### 6.1 Stack recommendation
- **Next.js 15 (App Router, TypeScript) + Tailwind + shadcn/ui.** One codebase for the public page, the editor dashboard, and the API. Deploys to Vercel with zero config and also builds into a small Docker image, so the hosting choice does not lock anything in.
- **Database:** Postgres via Drizzle ORM. On Vercel use Neon's free tier. On the Docker server run Postgres as a sidecar container. Same schema either way. (SQLite is tempting for a single event but does not persist on Vercel, so Postgres keeps both hosting options open.)
- **Editor auth:** Auth.js with Google sign-in and a hard-coded allowlist of three emails (owner, partner, host). No sign-up page. Fallback if any editor lacks a Google account: a single shared editor passcode set as an environment variable.
- **Guest identity:** no account. Claim form takes name + email; a signed, httpOnly cookie remembers the guest on that device so they can see and release their own claims.
- **Email:** deferred. Without a verified domain, free transactional-email tiers can only send to the owner's own address. v1 shows confirmations on screen and stores guest emails for the thank-you list. Owner notifications on new claims can go through a free ntfy.sh or Telegram bot webhook if wanted.
- **Link scraping:** when an item has a store URL, fetch it server-side and read Open Graph / schema.org tags for title, image, and price; editor can override. Cache the result; re-check weekly for dead links.
- **Images:** store the scraped image URL and proxy it through the app with caching. Allow a manual image upload for curated items without a link (Vercel Blob or a local volume on Docker).
- **Swish:** generate `swish://payment?data={payee, amount, message}` deep links with the payee locked and the amount editable, plus a QR code of the same payload for guests on desktop. Guest taps "I've sent it" and enters the amount; the fund progress bar updates. Verify the exact JSON payload against Swish's official QR documentation during implementation.

### 6.2 Surprise mode and name visibility, precisely
- Editors see per item: quantity claimed, quantity purchased, fund total. They do **not** see guest names, emails, messages, or which specific claim is purchased until the reveal date.
- Reveal date defaults to 6 Dec 2026 (shower day); any editor can change it or reveal early.
- Other guests see an item as "claimed" or "x of y claimed". If the claiming guest ticked "show my name", other guests see "Claimed by Anna". Default is hidden.
- After reveal, editors see the full list with names, emails, messages, optional addresses, and a thank-you checkbox per gift. CSV export.

### 6.3 Item types
1. **Physical item** — name, image, optional store link, price, quantity, priority, category, notes. Claim decrements quantity. Soft-reserve expires after 72 h unless marked purchased.
2. **Group gift** — one expensive item with a goal in SEK. Guests contribute via Swish and self-report. Progress bar. Optional "or buy it yourself" path.
3. **Cash fund** — same mechanics as group gift, with no product (diaper fund, nursery fund, savings fund).
4. **"Happily take used" flag** on physical items.

### 6.4 Pages
- `/` — public registry: cover, welcome text, event details (date, time, place, map link, host contact), category filter, item grid, funds.
- `/item/[id]` — claim sheet/modal: name, email, quantity, optional message, "show my name" toggle, optional address, mark purchased.
- `/my-claims` — guest's own claims on this device; release or mark purchased.
- `/admin` — editor dashboard: item CRUD, drag-order, categories, event details, theme, reveal date, aggregate progress, post-reveal gift list and thank-you tracker, CSV export.
- `/admin/sign-in`.

### 6.5 Data model
- `Registry` (one row): title, welcome, eventDate, eventTime, location, mapUrl, hostContact, theme, revealAt, coverImage
- `Editor`: email, name, role (owner | partner | host)
- `Category`: name, sortOrder, icon
- `Item`: type (physical | group | fund), name, description, imageUrl, storeUrl, price, qtyWanted, priority, categoryId, notes, usedOk, goalAmount, sortOrder
- `Claim`: itemId, guestName, guestEmail, qty, status (reserved | purchased | released), amount, message, showName, address, expiresAt, createdAt
- `ThankYou`: claimId, sentAt, note

## 7. Schedule to 6 December (four weeks from today)

| Week | Dates | Deliverable |
|---|---|---|
| 1 | 7–13 Nov | Scaffold, DB, editor sign-in, item CRUD with link scraping, public page, claim flow, surprise-mode aggregates. Deployed to a shareable URL. |
| 2 | 14–20 Nov | Group gifts and cash funds with Swish deep link + QR, guest "my claims", theme applied, mobile polish, categories, starter item list imported. **Send link to guests by ~20 Nov.** |
| 3 | 21–27 Nov | Reveal logic, post-reveal gift list, thank-you tracker, CSV export, dead-link check, owner notifications (optional). Bug fixes from real guest use. |
| 4 | 28 Nov – 5 Dec | Freeze features. Monitor claims, fix issues, prepare reveal. |
| — | 6 Dec | Shower. Reveal. |

Anything in Tier 3 of section 2 is explicitly after the shower or never.

## 8. Theme suggestions

All gender-neutral by default. Each gives a palette, type pairing, and motif so the page looks designed rather than templated. Implemented as CSS variables so switching is one setting.

1. **Nordic Soft** — warm off-white `#F7F3EE`, sage `#A8B5A0`, muted terracotta `#D9A58B`, charcoal text. Fonts: Fraunces (headings) + Inter. Motif: thin line illustrations of birch leaves and small stars. Calm and Scandinavian; fits a Swedish December shower.
2. **Winter Hygge** — cream, deep forest green `#2F4A3A`, dusty gold `#C9A86A`, snow white. Fonts: Playfair Display + Source Sans. Motif: pine sprigs, candle glow, faint snow dots. Leans into the 6 Dec date without being Christmas.
3. **Sunrise Pastel** — pale peach `#FFE1CF`, butter yellow `#FFF1B8`, sky `#CFE6F5`, lavender `#E3D7F3`. Fonts: Quicksand + Nunito. Motif: clouds, sun, rainbow arc. Classic baby-shower cheer, modern pastel rather than pink/blue.
4. **Little Botanist** — linen `#F4F1EA`, eucalyptus `#8FA98F`, clay `#C97B5A`, ink `#2B2B2B`. Fonts: Cormorant Garamond + Work Sans. Motif: eucalyptus, monstera, pressed-flower illustrations. Earthy and elegant.
5. **Moon & Stars** — midnight navy `#1E2A44`, cream, soft gold `#E6C27A`, blush accent. Fonts: DM Serif Display + DM Sans. Motif: crescent moon, scattered stars, "twinkle" micro-animation on hover. Dark-mode friendly and striking on phones.
6. **Woodland Friends** — oat, moss, rust, mushroom brown. Fonts: Baloo 2 + Nunito. Motif: fox, hedgehog, mushrooms. Playful; best if you already have a woodland invitation to match.

Recommendation: **Nordic Soft** or **Winter Hygge** given the season and location; both read well in Swedish and English and print nicely for a QR card at the venue.

## 9. Remaining questions

1. **Language:** Swedish, English, or a toggle for both? Affects every label and the starter item list.
2. **Currency:** SEK everywhere, or show both SEK and another currency for guests abroad?
3. **Hosting pick:** Vercel free tier (easiest, `*.vercel.app` URL, zero ops) or your Docker server (needs public HTTPS via reverse proxy and a dynamic-DNS or similar hostname)? I recommend Vercel unless you already have HTTPS and a hostname on the Docker box.
4. **Editor sign-in:** do all three editors have Google accounts, or should it be a shared passcode?
5. **Swish payee:** whose Swish number receives fund contributions? One number for everything, or different numbers per fund?
6. **Starter list:** do you want me to seed a Swedish-market starter list of items by category for you to prune, or will you enter the list yourself?
7. **Theme:** pick one from section 8, or send an invitation/photo to match.
8. **Reveal:** reveal on 6 Dec automatically, or keep it manual so one of you presses the button at the shower?
9. **Owner notifications:** want a ping on new claims (Telegram or ntfy), or is checking the dashboard enough?
10. **Guest release:** should guests be able to un-claim an item themselves, or only by emailing you?

## 5. Sources consulted
- Babylist group gifting help article: https://help.babylist.com/hc/en-us/articles/360052390974-What-is-Group-Gifting
- Babylist feature summary: https://www.babylist.com/llms.txt
- Zola baby registry comparison: https://baby.zola.com/advice/best-baby-registry-sites
- WishDeck registry comparison: https://www.wishdeck.com/blog/best-baby-registry-sites-apps
- GiftList vs Babylist: https://giftlist.com/blog/giftlist-vs-babylist
- EasyTot registry comparison (completion discounts): https://easytot.com/blogs/guides/best-baby-registry
- Self-hosted wishlist apps: https://gittrend.io/repo/cmintey/wishlist , https://selfhostyourself.com/services/poenskelisten , https://noted.lol/wishthis-self-hosted-wishlist-platform/
- Swish QR / deep-link payload (third-party wrappers of the official QR API): https://www.npmjs.com/package/swish-qr , https://www.ruby-toolbox.com/projects/swish_qr , https://github.imc.re/gillstrom/swish-qr
