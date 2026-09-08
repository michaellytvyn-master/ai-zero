# Chrome Web Store listing

Copy these into the developer dashboard. Keep them true to what the code does —
a listing that overstates the privacy story is worse than no listing.

## Name

Zero-Cost AI

## Short description (132 characters max)

> Chat with AI on free provider tiers. Falls over to another provider when one
> is rate limited, and shows what you would have paid.

(126 characters.)

## Single purpose

> Provide a chat assistant in the browser side panel that runs on the free
> tiers of several large language model providers, failing over between them
> automatically.

## Detailed description

> Zero-Cost AI is a chat assistant that runs on the free tiers of several
> providers instead of a paid subscription.
>
> Ask a question in the side panel and the request goes to whichever provider
> is available. If one is rate limited or down, the next one answers, and the
> panel tells you which provider it was. You can dictate instead of typing —
> speech is transcribed by Whisper on the same free tier. It can read the page
> you are on, as
> readable text or as HTML source, so you can ask about what is in front of
> you, and selecting text anywhere lets you quote just that.
>
> Add your own free API keys and requests go straight from your browser to the
> provider, so nothing passes through our servers, and it keeps working even
> when they are down. Without your own keys you get a small number of messages
> a day from a shared pool.
>
> A counter shows what the same usage would have cost on a paid model. It is an
> estimate against published prices, not a bill, and it deliberately compares
> against an inexpensive model rather than a flagship.
>
> An account on the website is required. Conversations are saved there so you
> can pick them up on another device, and keys you add are encrypted before
> they are stored.
>
> Open source, MIT licensed.

## Category

Productivity

## Permission justifications

Reviewers read these. Each one names the feature that stops working without it.

| Permission | Why it is needed |
|---|---|
| `sidePanel` | The extension's entire interface is a side panel. Without it there is no UI. |
| `storage` | Caches the signed-in session, the user's own provider keys, and the last savings figure in `chrome.storage.local`, so the panel works across browser restarts and while the server is unreachable. Never `chrome.storage.sync`. |
| `identity` | Sign-in uses `chrome.identity.launchWebAuthFlow` against the extension's own website. It is the only way the user authenticates; no password is ever typed into the extension. |
| `contextMenus` | Adds the single "Ask AI about ..." item shown when text is selected, which is how a user quotes a passage into the chat. |
| `web_accessible_resources` (`mic.html`) | Chrome will not show the microphone prompt inside a side panel, so voice input opens this one-purpose page to ask for it once. It requests access, releases the device immediately, and does nothing else. |
| `tabs` | The panel binds each chat to the tab it was started on and shows which tab that is, which needs the tab's title and URL. |
| `scripting` | Runs the one function that collects page content. It is invoked only when the user has switched page reading on, only against the active tab, and only for a site they have granted. |

### Host permissions

| Origin | Why it is needed |
|---|---|
| `https://api.groq.com/*`, `https://api.cloudflare.com/*` | When the user has added their own key, chat requests are sent directly to that provider from the browser. This is what keeps the key out of any intermediary. |
| The extension's own website origin | Sign-in, syncing the user's keys and conversations, and reporting usage counts. Replace `http://localhost:3000/*` with the production origin before publishing. |

### Optional host permissions

`http://*/*` and `https://*/*` appear under `optional_host_permissions`, which
grants nothing at install. When the user switches page reading on, the extension
calls `chrome.permissions.request` for **that one site's origin** — Chrome shows
its own prompt, the user decides, and declining turns the control back off.

So the extension has access to no website until a person grants it, one site at
a time. Nothing broad is granted up front, and `scripts/check-extension.mjs`
fails the build if a broad pattern is ever moved into `host_permissions`.

## Data disclosures

Answer the dashboard's data-use form as follows, because all of it is true:

- **Personally identifiable information** — collected. The email address of the
  Google account used to sign in, for authentication.
- **Authentication information** — collected. Provider API keys the user
  chooses to add, encrypted at rest.
- **User activity** — collected. Which provider answered, the model, token
  counts, latency, HTTP status and a timestamp, per request.
- **Audio** — collected only while the user is holding a voice recording. It is
  sent to the transcription provider and never stored by this extension or its
  server; only the resulting text is kept, and only if the user sends it.
- **Website content** — collected only at the user's request. Page text is sent
  to a model provider when the user presses "Add page" or quotes a selection,
  and the resulting conversation is saved to their account.
- **Health, financial, location, personal communications, web history** — not
  collected.

Certifications to tick:

- Data is not sold to third parties.
- Data is used only for the item's single purpose.
- Data is not used to determine creditworthiness or for lending.

A conversation's text is sent to the model provider that answers it, and some
free tiers train on submitted content. That is stated on the website's privacy
page and must not be omitted here.
