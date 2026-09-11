# Publishing

Three things, in this order, because each depends on the one before:

1. [The code on GitHub](#1-the-code-on-github) — source available, noncommercial.
2. [The website, deployed](#2-the-website-deployed) — the extension signs in against it, so it has
   to exist first.
3. [The extension, in the Chrome Web Store](#3-the-extension-in-the-chrome-web-store).

Checked against Chrome's and Vercel's documentation on 2026-09-10. Store rules change; if a step
here disagrees with the dashboard, the dashboard wins.

## 1. The code on GitHub

Nothing secret is in the history: every commit was scanned before this was written, and the only
key-shaped strings are test fixtures (`gsk_live…`, `gsk_real…`). GitHub's secret scanning may still
flag them; they are not keys, and can be dismissed as false positives.

The author name and email on every commit become public with the history. Check them with
`git log --format='%an <%ae>' | sort -u` before pushing.

```bash
gh auth login
```

```bash
gh repo create zero-cost-ai --public --source=. --push --description "One chat, one OpenAI-compatible API and a browser agent — over the free AI accounts you already own."
```

Then, on the repository page:

- **Settings → General → Social preview**: upload `docs/images/banner.png`. This is the card shown
  when the link is shared.
- **Settings → Security → Private vulnerability reporting**: enable it. [SECURITY.md](../SECURITY.md)
  sends reporters there.
- **About (the gear by the description)**: add topics — `ai`, `llm`, `chrome-extension`, `nextjs`,
  `openai-compatible`, `groq`, `gemini`, `byok`.
- The README's CI badge points at `michaellytvyn-master/ai-zero`. In a fork, change both names in
  its URL to your own.

## 2. The website, deployed

Any host that runs Next.js works. The notes below are for Vercel, whose free plan is enough.

**A database.** Postgres 16. Several hosts have a free tier; any of them gives you a
`DATABASE_URL`.

**The project.** Import the repository in Vercel and set **Root Directory** to `apps/web`.

**Environment variables.** Everything in [.env.example](../.env.example), and in particular:

| Variable | Why it matters here |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Your real address, e.g. `https://zerocost.example`. **Set it before the first build** — `robots.txt`, `sitemap.xml` and the Open Graph card are rendered at build time, so an address added later is not in them until you rebuild. |
| `DATABASE_URL`, `AUTH_SECRET`, `KEY_ENCRYPTION_KEY` | Required. Keep `KEY_ENCRYPTION_KEY` somewhere safe: lose it and every stored provider key is unreadable. |
| `CRON_SECRET` | Protects the cleanup endpoint. Any long random string. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Optional; leave empty and `/admin` has nothing to sign in to. |
| `GROQ_API_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `GEMINI_API_KEY` | Optional: the shared trial pool. Leave empty and new users must add their own key first. |
| `CLOUDINARY_*` | Optional: the shared image pool. |
| `AUTH_TRUST_HOST=true` | **Only off Vercel.** `next start` elsewhere refuses to trust the host without it, and every sign-in fails with `UntrustedHost`. Vercel does not need it. |

**The schema.** Once, from your machine, against the production database:

```bash
DATABASE_URL="postgres://…production…" pnpm db:push
```

**Google sign-in**, if you use it: add `https://your-domain/api/auth/callback/google` to the OAuth
client's redirect URIs.

**The image sweep.** Vercel's free plan runs a cron at most once a day, and a more frequent schedule
in `vercel.json` fails the deploy — so `vercel.json` sweeps daily, and the every-15-minutes sweep
that keeps the "deleted after an hour" promise runs from GitHub Actions instead. In the repository's
**Settings → Secrets and variables → Actions**:

- a **variable** `SITE_URL` = your address
- a **secret** `CRON_SECRET` = the same value as on Vercel

Until `SITE_URL` is set the workflow skips itself, so forks do not fail.

## 3. The extension, in the Chrome Web Store

### Build it against your site

The extension talks to one site, chosen at build time. In
[`apps/extension/public/manifest.json`](../apps/extension/public/manifest.json), replace
`http://localhost:3000/*` under `host_permissions` with your origin, and raise `version` for every
upload after the first. Then:

```bash
VITE_SITE_URL=https://your-domain pnpm ext
```

`pnpm ext` checks the build would load and prints where it is. Zip the **contents** of that folder,
not the folder itself:

```bash
cd apps/extension/dist && zip -r ../../../zero-cost-ai-extension.zip . && cd -
```

### Register

At <https://chrome.google.com/webstore/devconsole>, sign in with the Google account that will own
the listing, accept the developer agreement, and pay the one-time registration fee — the dashboard
shows the current amount.

### Create the item

**Upload** the zip. Then fill in each tab from files already in this folder:

| Dashboard tab | Take it from |
|---|---|
| Store listing — description, category | [listing.md](listing.md) |
| Store listing — icon | [icon-128.png](icon-128.png) |
| Store listing — small promo tile (required) | [promo-small-440x280.png](promo-small-440x280.png) |
| Store listing — marquee (optional) | [promo-marquee-1400x560.png](promo-marquee-1400x560.png) |
| Store listing — screenshots | capture them: [screenshots.md](screenshots.md) |
| Privacy practices — single purpose, permission justifications, data use | [listing.md](listing.md) |
| Privacy practices — privacy policy URL | `https://your-domain/privacy` |

The privacy policy URL is required, because the extension handles authentication information and
website content. It must be the deployed page, readable without signing in.

### Submit, then pin the id

Choose **Submit for review**. Chrome's guidance is a few days, sometimes a few weeks. Expect the
longer end: new developers, new extensions and broad host permissions each draw a closer look, and
this extension has all three. The justifications in [listing.md](listing.md) are written for that
review; keep them true.

Once the item exists it has a permanent id, shown in the dashboard. Add it to `EXTENSION_IDS` on
your deployment, together with your local unpacked id if you still develop against production:

```
EXTENSION_IDS=<store id>,<unpacked id>
```

From then on only your extension can be given a sign-in token. Without it, any other installed
extension could open the consent page — which looks like this product's — and be connected if the
user pressed Allow.

### Updating

Raise `version` in the manifest, rebuild, zip, and upload the new package on the same item. Each
update is reviewed again; significant code changes draw a closer review.
