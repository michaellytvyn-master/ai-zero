# Security

This project holds other people's API keys, and its extension can act on web pages. A vulnerability
here is someone else's quota, or someone else's account. Please report one privately.

## Reporting

Use **[private vulnerability reporting](../../security/advisories/new)** on this repository — the
*Report a vulnerability* button under the Security tab. Please do not open a public issue.

Helpful to include: what an attacker needs (an account, an installed extension, a page the victim
visits), what they get, and the smallest steps that show it.

You should hear back within a week. Fixes are credited in the release notes unless you would rather
not be named.

## What is in scope

- Anything that reveals a user's provider keys, conversations or sign-in token to someone else.
- The browser agent doing something irreversible without the confirmation it promises, typing a
  credential, or opening an address that carries page content out — see
  [docs/agent.md](docs/agent.md) for the rules it is meant to keep.
- Server-side request forgery through the link reader.
- Bypassing the per-account rate limit or the trial allowance.

## Worth knowing before you look

These are deliberate, documented, and not vulnerabilities in themselves:

- **The extension holds provider keys in `chrome.storage.local`.** Direct mode calls providers from
  the browser, so it must. Anything that can read another extension's storage can already do worse.
- **Google Gemini's free tier keeps what is sent** for training and human review. That is Google's
  term, disclosed on the key form, in the panel and on the privacy page.
- **Without `EXTENSION_IDS` set, any extension may request a sign-in token** — the user still has to
  press Allow on a page that shows the requesting extension's id. Deployments should set it; see
  [store/PUBLISHING.md](store/PUBLISHING.md).

## Properties the code holds, with tests

- Provider keys are encrypted with AES-256-GCM; the key that opens them is never in the database.
- Only an extension token can read provider keys in the clear — not an API key, not a site cookie.
- Usage records cannot carry message text: a test pins their exact fields.
- The link reader refuses private, loopback, link-local and metadata addresses on every redirect hop.
- The agent refuses credentials by field and by value shape, and confirms submits, sends and
  model-composed addresses. Its confirmation resolves *no* on every path but an explicit *Do it*.
