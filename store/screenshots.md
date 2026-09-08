# Screenshots and the demo recording

These need a real Chrome profile with the extension loaded and a signed-in
account, so they have to be captured by hand. Everything else in `store/` is
ready to paste.

## What the store requires

- At least one screenshot, 1280x800 or 640x400. Five is the maximum and the
  first is the one most people see.
- Optional promo tile, 440x280. Skip it until the rest is ready; a bad tile is
  worse than none.

## Setup

```bash
pnpm --filter @zca/extension build
```

Load `apps/extension/dist` at `chrome://extensions` with developer mode on,
run the site with `pnpm dev`, and sign in through the panel.

## The five to capture

1. **A chat mid-answer**, with the provider badge visible. This is the first
   screenshot: it shows the product working and shows the failover story in one
   glance. Ask something whose answer is a few lines, and capture while the
   provider badge reads `via groq` or similar.
2. **The savings panel open**, showing the total and the per-provider
   breakdown. Use an account with real history — a total of `$0.0000` sells
   nothing and looks broken.
3. **Right-click "Ask AI about ..."** on selected text on a real article, with
   the context menu open.
4. **"Add page" used**, showing the quoted page context in the composer and the
   truncation note.
5. **The keys page on the site**, showing a key stored as `••••` with its last
   four characters. This is the one that answers "where do my keys go".

Do not stage a screenshot with a fabricated savings total or a provider that
did not actually answer. The numbers are cheap to generate honestly.

## The README recording

A short loop is enough: open the panel with the keyboard shortcut, ask
something, let it stream, open the savings panel. Keep it under fifteen seconds
and save it to `docs/demo.gif`, then the README picks it up.
