# Baby Shower Registry App — Planning Document

Status: planning only. No code yet. See "Open Questions" at the end; answers there decide the architecture.

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
12. **Built-in RSVP.** Yes/No/Maybe, plus-ones, dietary notes, mailing address for thank-you cards. Guest list management for the host.
13. **Thank-you tracker.** Mark each gift as "thanked", merge address from RSVP, print labels.
14. **Email notifications.** Owner: new claim, new RSVP. Guest: claim confirmation with store link, reminder before expiry, event reminder.
15. **Multiple registries / events per account.** Second baby, sprinkle, or hosting for a friend.
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

## 3. Architecture sketch (to be confirmed by answers below)

Default recommendation for a one-or-few-registries personal app:

- **Stack:** Next.js (App Router, TypeScript) + Tailwind. Server actions for mutations. Single codebase, easy Vercel deploy.
- **Database:** Postgres (Neon or Supabase free tier) via Prisma or Drizzle. SQLite is fine if it's truly one event and self-hosted.
- **Auth:** Owner-only auth via Auth.js (magic-link email). Guests are identified by email + a signed cookie, no account.
- **Scraping:** Server-side fetch of product URL, parse OG/schema.org tags; fall back to manual. Rate-limited, cached.
- **Email:** Resend or Postmark (transactional). ~3 templates.
- **Payments (Tier 2B only):** Stripe Checkout + Connect. Skip until the Venmo-link approach proves insufficient.
- **Hosting:** Vercel + Neon, or a single Docker container on Fly.io/Railway if you prefer self-hosting.
- **Images:** Store scraped image URLs; proxy/cache through the app to avoid hotlink breakage. Optional upload to S3/R2 for custom photos.

### Core data model (first pass)
- `User` (owner) — id, email, name
- `Registry` — id, ownerId, slug, title, welcome, eventDate, location, surpriseRevealAt, password?, theme
- `Item` — id, registryId, name, url, imageUrl, price, store, qtyWanted, priority, category, notes, isGroupGift, isCashFund, goalAmount
- `Claim` — id, itemId, guestName, guestEmail, qty, status (reserved | purchased | released), amount (for funds), message, expiresAt, createdAt
- `Rsvp` — id, registryId, name, email, response, partySize, dietary, address
- `ThankYou` — claimId, sentAt

### Rough phasing
1. **Week 1:** scaffold, auth, registry page, item CRUD with URL scrape, claim flow, owner dashboard. Deployable and usable.
2. **Week 2:** surprise mode, RSVP, emails, CSV export, theming polish.
3. **Week 3+:** cash funds / group gifts (link-out first), thank-you tracker, starter checklist, price re-check.

## 4. Open questions (your answers change the plan)

1. **Who is this for?** (a) Your own upcoming shower, one event; (b) a reusable app for friends/family; (c) a public product anyone can sign up for. This is the biggest fork: (a) can be SQLite + one hard-coded owner; (c) needs multi-tenancy, abuse protection, legal pages.
2. **Universal registry or curated list?** Should guests be sent out to Amazon/Target/etc. to buy, or do you want to pick items and have guests just "claim" them and buy wherever they like?
3. **Money:** Do you want cash funds / group gifting at all? If yes, is "show my Venmo and let guests self-report" acceptable for v1, or do you need real card payments in-app (Stripe, fees, payout account)?
4. **Surprise mode:** Do you want to see who bought what as it happens, or be surprised at the shower?
5. **RSVP:** Built in, or are invitations/RSVPs handled elsewhere (Evite, Paperless Post, a group text)?
6. **Guest friction:** Is name + email enough for guests, or should claiming be fully anonymous (no email), accepting that abandoned claims can't be reminded?
7. **Hosting & cost:** Happy with a hosted free tier (Vercel + Neon), or do you want to self-host in Docker? Any budget for custom domain and email service (~$0–15/mo)?
8. **Tech preferences:** Any stack you want or want to avoid (React/Next.js, Svelte, Python/Django, Rails)? Any existing accounts (Supabase, Firebase, AWS)?
9. **Timeline:** When is the shower (or launch)? That sets how much of Tier 2 is realistic.
10. **Design:** Any theme, colors, or an existing invitation to match? Gender-neutral default?
11. **Co-owner:** Will a partner or shower host also need to edit the registry?
12. **Privacy:** Should the registry be discoverable (public URL anyone can share) or protected (password or invite-only links)?

## 5. Sources consulted
- Babylist group gifting help article: https://help.babylist.com/hc/en-us/articles/360052390974-What-is-Group-Gifting
- Babylist feature summary: https://www.babylist.com/llms.txt
- Zola baby registry comparison: https://baby.zola.com/advice/best-baby-registry-sites
- WishDeck registry comparison: https://www.wishdeck.com/blog/best-baby-registry-sites-apps
- GiftList vs Babylist: https://giftlist.com/blog/giftlist-vs-babylist
- EasyTot registry comparison (completion discounts): https://easytot.com/blogs/guides/best-baby-registry
- Self-hosted wishlist apps: https://gittrend.io/repo/cmintey/wishlist , https://selfhostyourself.com/services/poenskelisten , https://noted.lol/wishthis-self-hosted-wishlist-platform/
