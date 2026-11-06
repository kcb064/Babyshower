# Babyshower registry

A small, self-hosted baby shower wish list (Swedish/English) for one event. Guests open a public
link, reserve gifts with name + email (no account), and can release or mark them as bought from
"Mina reservationer". Editors share one passcode. Surprise mode hides who claimed what from the
editors until reveal. Theme: Little Botanist. See `PLAN.md` for the full spec.

Stack: Next.js 15 (App Router) · Tailwind CSS v4 · SQLite via Drizzle + better-sqlite3 · next-intl.

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
pnpm test           # vitest unit tests (claims, surprise mode, SEK, i18n, cookies, scraper, ntfy)
pnpm test:e2e       # builds, starts the standalone server on :3100 with a temp DB and EDITOR_PASSCODE=test
pnpm build
```

`E2E_SKIP_BUILD=1 pnpm test:e2e` reuses an existing build.
