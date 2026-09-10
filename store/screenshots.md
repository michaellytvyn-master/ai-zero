# Store images

Checked against <https://developer.chrome.com/docs/webstore/images> on 2026-09-10.

| Asset | Size | Required | Status |
|---|---|---|---|
| Store icon | 128×128 PNG, 96×96 artwork + 16px transparent padding | yes | ready — [`icon-128.png`](icon-128.png) |
| Small promo tile | 440×280 | **yes** | ready — [`promo-small-440x280.png`](promo-small-440x280.png) |
| Screenshots | 1280×800 (preferred) or 640×400, one to five | yes | **capture by hand** — below |
| Marquee promo | 1400×560 | no | ready — [`promo-marquee-1400x560.png`](promo-marquee-1400x560.png) |

The icons and tiles are generated: `pnpm icons` draws the icons, and the tiles use the same mark and
palette. The small promo tile was once listed here as optional; it is required now, and a listing
without one is shown after every listing that has one.

## Screenshots — these need a real signed-in profile

They show the extension working, so they cannot be generated. Build it against the site you will
publish with, load `apps/extension/dist`, sign in, and add at least one provider key with a little
real history behind it.

Capture at 1280×800. On macOS, size the window first, then <kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>4</kbd>
and <kbd>Space</kbd> to capture that window.

1. **A chat mid-answer** in the side panel, beside a real article, with the provider badge visible.
   This is the first image and most people see only this one: it shows the product working.
2. **Act mode stopped at the confirmation gate** — "click [n] "Send" — This submits the form." with
   *Don't* and *Do it*. It answers the question every careful user has before installing an
   extension that can click: what stops it doing something I didn't want?
3. **A reasoning model answering**, with the thinking collapsed above the answer.
4. **Right-click "Ask AI about …"** on selected text, with the context menu open.
5. **The keys page on the site**, a key shown as `••••` and its last four characters. This one
   answers "where do my keys go".

Do not stage a screenshot with a fabricated savings total, a provider that did not actually answer,
or an action the extension did not take. The real ones are cheap to make.

## The README recording, optional

A short loop: open the panel with the keyboard shortcut, ask something, let it stream. Under fifteen
seconds, saved as `docs/images/demo.gif`, and add it to the README under the screenshots.
