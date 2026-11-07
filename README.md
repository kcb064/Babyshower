# Babyshower registry

A small, self-hosted baby shower wish list (Swedish/English) for one event. Guests open a public
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
pending count, never names before reveal. ntfy sends `Nytt bidrag: Blöjfond 300 kr (3 100 / 5 000)`
when a contribution is confirmed.

**Starter list.** About 60 Swedish-market suggestions (`src/db/starter.ts`) are inserted hidden on the
first start. Pick what to show at `/admin/starter` (per item or per category). Seeding runs once:
deleted suggestions do not come back on restart.

## Environment

Copy `.env.example` to `.env` and fill it in.

| Variable | Required | Purpose |
|---|---|---|
| `EDITOR_PASSCODE` | yes (prod) | Shared passcode for `/admin/sign-in` |
| `COOKIE_SECRET` | yes (prod) | HMAC key for cookies, e.g. `openssl rand -hex 32` |
| `NTFY_TOPIC` | no | Secret ntfy.sh topic for push notices on claim / purchase / release. Empty disables. |
| `PUBLIC_URL` | no | Public tunnel URL, used for the durable "my claims" link. Falls back to request host. |
| `DATABASE_PATH` | no | SQLite file (default `./data/registry.db`, `/data/registry.db` in Docker) |
| `DATA_DIR` | no | Uploads go to `DATA_DIR/uploads` (default `./data`, `/data` in Docker) |

The server refuses to start in production without `EDITOR_PASSCODE` and `COOKIE_SECRET`.
Migrations run and default data is seeded automatically on startup.

## Run with Docker

```sh
cp .env.example .env   # then edit
docker compose up -d --build
docker compose logs -f babyshower
```

Data (database + uploads) lives in the named volume `babyshower-data`. Backup = copy `/data/registry.db`.

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
```

## Tests

```sh
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest unit tests (claims, funds, Swish, starter seed, SEK, i18n, cookies, scraper, ntfy)
pnpm test:e2e       # builds, starts the standalone server on :3100 with a temp DB and EDITOR_PASSCODE=test
pnpm build
```

`E2E_SKIP_BUILD=1 pnpm test:e2e` reuses an existing build.
