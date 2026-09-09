# Chrome Web Store listing

Copy these into the developer dashboard. Keep them true to what the code does —
a listing that overstates the privacy story is worse than no listing.

## Name

Zero-Cost AI

## Short description (132 characters max)

> One interface for the AI accounts you already own. Connect your own free API
> keys and use them anywhere.

(122 characters.)

## Single purpose

> Provide a browser side panel that lets a user chat through their own language
> model API keys, routing between the providers they have connected and failing
> over when one is unavailable.

## Detailed description

> This extension does not provide access to AI models and does not resell it.
> You register with Groq and Cloudflare yourself — both are free and neither
> asks for a credit card — and this is the software that makes those accounts
> usable in a browser.
>
> Paste your keys in once on the website. From then on the side panel answers on
> your own quota: pick from the models your keys unlock, switch model mid
> conversation, and when one provider is rate limited the next one answers and
> the panel tells you which.
>
> Each tab keeps its own chat. Open the panel on a tab and it stays there;
> switch tabs and it does not follow you. It can read the page you are on, as
> text or as HTML source, so you can ask about what is in front of you, and
> selecting text lets you quote just that. You can dictate instead of typing.
>
> Conversations are stored on your account, so the same chat is on the website
> and in every browser you sign in from.
>
> A counter shows what the same usage would have cost on a paid model. It is an
> estimate against published prices, measured deliberately against an
> inexpensive model rather than a flagship.
>
> New accounts get a small daily allowance on the operator's keys, so you can
> see whether it is worth registering with a provider at all. It is limited to
> the smallest model and is not part of any paid plan.
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
| `tabGroups` | Tabs the panel is open on are collected into one named group, so a user can see which tabs it is attached to. There is a toggle to turn this off. |
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

- **Personally identifiable information** — collected. The email address used to
  sign in, for authentication.
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
