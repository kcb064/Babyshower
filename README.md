# Babyshower registry

A small, self-hosted baby shower wish list (English by default, Swedish toggle) for one event. Guests open a public
link, reserve gifts with name + email (no account), and can release or mark them as bought from
"Mina reservationer". Editors share one passcode. Surprise mode hides who claimed what from the
editors until reveal. Theme: Little Botanist. See `PLAN.md` for the full spec.

Stack: Next.js 15 (App Router) · Tailwind CSS v4 · SQLite via Drizzle + better-sqlite3 · next-intl.

## Item types, Swish and the starter list

- **Sak / Item** (`physical`): guests reserve a quantity (held 72 h) and mark it bought.
- **Gruppresent / Group gift** (`group`): a product with a goal (defaults to the price). Guests chip in
  via Swish, or one guest can take "Jag köper hela" (buy it whole) while nobody has contributed yet;
  that uses the normal reserve flow for qty 1 and shows the goal as fully covered.
- **Insamling / Cash fund** (`fund`): no product, just a name, description and goal (e.g. Blöjfond).

**Swish contributions.** Set the Swish number under *Om babyshowern* in `/admin` (Swedish mobile `07x…`
or a `123…` Swish number; spaces, dashes and `+46` are normalised away). A guest picks an amount
(200/300/500/1000 kr or a free amount, min 20 kr) and gets a page with an "Öppna Swish" deep link
(`swish://payment?data=…` with payee and amount locked, message editable), a QR code of the same link
for desktop guests (generated server-side with `qrcode`), and the number to copy. The contribution only
counts toward the progress bar after the guest taps **"Jag har swishat"** (also available from
"Mina reservationer"); unconfirmed contributions are dropped after 24 h. There is no payment
verification: it is self-reported, by design. Editors see the total, number of contributions and
pending count, never names before reveal. ntfy sends `New contribution: Nappy fund 300 kr (3 100 / 5 000)`
when a contribution is confirmed.

**Starter list.** About 60 Swedish-market suggestions (`src/db/starter.ts`) are inserted hidden on the
first start. Pick what to show at `/admin/starter` (per item or per category). Seeding runs once:
deleted suggestions do not come back on restart.

## Reveal, peek and the gift list

- **`/admin/reveal` → Avslöja listan** is permanent. Type `AVSLÖJA` (or `REVEAL`) in the box and press the
  button; it records who and when, writes the editor log (always in English, using an item's English
  name when it has one) and sends the ntfy push
  "The registry was revealed by <name>". After that every editor sees names, emails, messages and addresses.
- **Titta en gång (peek)** shows the full list once without revealing it: tick "Jag förstår att det här
  förstör överraskningen" and submit. The list is only in that response (`Cache-Control: no-store`,
  gone on reload), the peek is logged ("Peek by <name>") and the dashboard shows
  "Senast tittad: <namn>, <när>" so the others know. `revealed` stays false.
- **`/admin/gifts`**: before reveal only the aggregate table. After reveal, every claim and contribution
  grouped by item with totals (funds list each contribution, unconfirmed Swish ones as "Väntar på
  bekräftelse"), plus a **Tackat** checkbox per gift with an optional note, filters
  (Alla / Inte tackade / Tackade) and "12 av 30 tackade". The dashboard also lists who gave what.
- **CSV export** `/admin/gifts/export.csv` (editors only, 403 before reveal): UTF-8 with BOM, `;`
  separator (Swedish Excel opens it directly with å/ä/ö), ISO dates. Columns: Item, Type, Name, Email,
  Qty, Amount (SEK), Status, Message, Address, Show name, Created, Thanked, Thank-you note
  (type: item / group gift / fund; status: Reserved / Purchased / Awaiting confirmation; yes/no for booleans). Free text
  starting with `= + - @` is prefixed with `'` so Excel never runs it as a formula.

## Link check, image proxy

- **Kontrollera länkar** (Verktyg on `/admin`) re-fetches the store page of every visible item with a link
  (5 at a time, 8 s timeout, at most once per 10 minutes) and stores `link_status`, `link_checked_at`
  and `scraped_price`. The item list then shows a red **Död länk** (404/410/5xx, timeout, network error)
  or an amber **Pris 1 195 kr (var 1 295 kr)** when the store price differs by 5 % or more. Bot walls
  (401/403/429) count as ok. Your own price is never changed; changing the store link clears the result.
  There is no scheduler: press the button when you want a check.
- **Image proxy**: scraped external images are shown via `/api/img?u=<url>`, which only serves URLs that
  are some item's `imageUrl` (http/https, no internal hosts), passes through `image/*` only (no SVG),
  caps at 5 MB, caches on disk under `DATA_DIR/imgcache/<sha256(url)>` and sends 7-day cache headers.
  Uploaded images keep `/api/uploads/…`.

## Backups

The server writes `${DATA_DIR}/backups/registry-YYYYMMDD-HHMM.db` (UTC) with better-sqlite3's online
`.backup()` 60 s after start and then every 24 h (production only), keeping the newest 14. Run one by hand:

- **Säkerhetskopiera nu** under Verktyg on `/admin` (shows the file name and how many are kept), or
- `pnpm backup` locally / `docker exec babyshower node scripts/backup.mjs` in Docker.

Copy the backups out of the Docker volume and restore one:

```sh
docker cp babyshower:/data/backups ./backups
# restore: stop the app, put the copy back as /data/registry.db, start again
# (if /data/registry.db-wal and -shm exist, remove them first, e.g. from a throwaway container on the volume)
docker compose stop babyshower
docker cp ./backups/registry-20261206-0300.db babyshower:/data/registry.db
docker compose start babyshower
```

## Environment

Copy `.env.example` to `.env` and fill it in.

| Variable | Required | Purpose |
|---|---|---|
| `EDITOR_PASSCODE` | yes (prod) | Shared passcode for `/admin/sign-in` |
| `COOKIE_SECRET` | yes (prod) | HMAC key for cookies, e.g. `openssl rand -hex 32` |
| `NTFY_TOPIC` | no | Secret ntfy.sh topic for push notices on claim / purchase / release, in English (e.g. `New reservation: Baby nest (1 of 2)`; guest names only after reveal). Empty disables. |
| `PUBLIC_URL` | no | Public tunnel URL, used for the durable "my claims" link. Falls back to request host. |
| `DATABASE_PATH` | no | SQLite file (default `./data/registry.db`, `/data/registry.db` in Docker) |
| `DATA_DIR` | no | `uploads/`, `backups/` and `imgcache/` live here (default `./data`, `/data` in Docker) |

The server refuses to start in production without `EDITOR_PASSCODE` and `COOKIE_SECRET`.
Migrations run and default data is seeded automatically on startup.

## Run with Docker

The image is built by GitHub Actions on every push and published to
`ghcr.io/kcb064/babyshower:latest` (plus `<branch>` and `<commit sha>` tags).
`docker-compose.yml` pulls that image, so the server never needs the source tree or a build.

```sh
cp .env.example .env   # then edit
docker compose pull
docker compose up -d
docker compose logs -f babyshower
```

Update later with `docker compose pull && docker compose up -d`.

**If the package is private** (the default for a new GHCR package), log in once on the server with a
personal access token that has `read:packages`:

```sh
echo $GHCR_TOKEN | docker login ghcr.io -u kcb064 --password-stdin
```

Or make the package public: GitHub → your profile → Packages → `babyshower` → Package settings →
Change visibility. A public package needs no login to pull.

**Building locally instead:** swap `image:`/`pull_policy:` for `build: .` in `docker-compose.yml` and run
`docker compose up -d --build`.

Data (database, uploads, backups, image cache) lives in the named volume `babyshower-data`. See *Backups* above.

### Sign-in loops back to the passcode page?

Cookies are marked `Secure` only when the request arrived over HTTPS (Cloudflare sets
`X-Forwarded-Proto: https`). If you open the app directly on `http://<host>:3000` the cookie is
sent without `Secure`, so both the tunnel address and a direct LAN address work. If sign-in still
loops, check that the browser accepts cookies for the site and that `COOKIE_SECRET` is set.

### Routing the existing Cloudflare Tunnel

No port is published by default. In your tunnel's public hostname settings (or `config.yml` ingress):

- **cloudflared runs in Docker:** attach it to the app's network
  (`docker network connect babyshower_default <cloudflared-container>`, or use the commented
  `networks` block in `docker-compose.yml`) and point the hostname at `http://babyshower:3000`.
- **cloudflared runs on the host:** uncomment `ports: - "3000:3000"` in `docker-compose.yml` and
  point the hostname at `http://localhost:3000` (or `http://<host-ip>:3000`).

Set `PUBLIC_URL` to that hostname (e.g. `https://shower.example.se`).

## Develop

```sh
pnpm install
pnpm dev            # http://localhost:3000, passcode "dev" if EDITOR_PASSCODE is unset
pnpm db:generate    # after editing src/db/schema.ts
pnpm backup         # one-off backup of DATABASE_PATH into DATA_DIR/backups
```

## Tests

```sh
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest unit tests (claims, funds, Swish, starter seed, SEK, i18n, cookies, scraper, ntfy,
                    #   reveal/peek rules, thank-yous, CSV, link check, backup retention, image proxy)
pnpm test:e2e       # builds, starts the standalone server on :3100 with a temp DB and EDITOR_PASSCODE=test
pnpm build
```

`E2E_SKIP_BUILD=1 pnpm test:e2e` reuses an existing build.
