# Chrome Web Store listing

Copy these into the developer dashboard. Keep them true to what the code does — a reviewer compares
the justifications against the code, and a listing that overstates the privacy story is worse than
no listing.

Last checked against the code: 2026-09-10, after the page agent and Gemini were added. If you change
what the extension can do, change this file in the same commit.

## Name

Zero-Cost AI

## Short description (132 characters max)

> An AI side panel on your own free API keys. Chats about the page, and can act on it — asking first
> before anything irreversible.

(128 characters.)

## Single purpose

> An AI assistant in the browser's side panel, running on the user's own language-model API keys,
> that answers questions about the current page and, when the user asks, carries out actions on it.

Chatting and acting are one purpose: an assistant for the page in front of the user. Reviewers may
ask about this; the answer is that every capability serves a request the user typed into the panel.

## Detailed description

> This extension does not provide access to AI models and does not resell it. You register with
> Groq, Cloudflare Workers AI or Google Gemini yourself — all three have a free tier and none asks
> for a credit card — and this is the software that makes those accounts usable in a browser.
>
> Paste your keys in once on the website. From then on the side panel answers on your own quota:
> pick from the models your keys unlock, switch model mid-conversation, and when one provider is
> rate limited the next one answers and the panel tells you which.
>
> Each tab keeps its own chat. Open the panel on a tab and it stays there; switch tabs and it does
> not follow you. It can read the page you are on, so you can ask about what is in front of you.
> You can dictate instead of typing.
>
> ACT MODE. Switch on Act and the panel can do things on the page for you: follow links, fill in
> fields, choose from menus, press Enter to search, go back, and read what comes back. It is off by
> default, and it is careful by design:
>
> • It never types a password, card number, CVV, PIN or one-time code — not even if asked to.
> • Anything that cannot be undone — submitting a form, sending a message, buying, deleting — waits
>   for you to press "Do it". Closing the panel counts as no.
> • It treats what the page says as information, never as instructions. It will only open a web
>   address the page links to or that you typed; any other address is shown to you in full first.
> • It stops after twelve steps.
>
> Connect a Postgres database of your own and your conversations are kept there — in your database,
> not ours — and the same chat is on the website and in every browser you sign in from. Without one,
> your last 20 messages are kept so you can try it. Nothing from Act mode is stored.
>
> Please know what your provider does with what you send. Groq and Cloudflare do not keep it for
> training. Google Gemini's free tier does, and Google's terms say reviewers may read it — the
> extension warns you at the moment a Gemini model is about to answer.
>
> New accounts get a small daily allowance on the operator's keys, so you can see whether it is
> worth registering with a provider at all.
>
> Source available under the PolyForm Noncommercial License 1.0.0.

## Category

Productivity

## Permission justifications

Reviewers read these. Each names the feature that stops working without it.

| Permission | Why it is needed |
|---|---|
| `sidePanel` | The extension's entire interface is a side panel. Without it there is no UI. |
| `storage` | Caches the signed-in session and the user's own provider keys in `chrome.storage.local`, so the panel survives browser restarts and works while the server is unreachable. Each tab's chat state lives in `chrome.storage.session`, which Chrome clears when the browser closes. Never `chrome.storage.sync`. |
| `identity` | Sign-in uses `chrome.identity.launchWebAuthFlow` against the extension's own website. It is the only way the user authenticates; no password is ever typed into the extension. |
| `contextMenus` | Adds the single "Ask AI about …" item shown when text is selected, which is how a user quotes a passage into the chat. |
| `tabs` | Binds each chat to the tab it was started on and names that tab in the panel, which needs the tab's title and URL. In Act mode, opens an address the user asked for in that same tab (`chrome.tabs.update`), goes back (`chrome.tabs.goBack`), and waits for the tab to finish loading before reading it again. |
| `tabGroups` | Tabs the panel is open on are collected into one named group, so the user can see which tabs it is attached to. A toggle turns this off. |
| `scripting` | Injects the extension's own bundled functions into the active tab — never remote code. With page reading on, one function reads the page's text. In Act mode, functions list the page's controls, and click, type into, choose from, scroll or press a key on the one the user's request needs. Nothing is injected unless the user has granted site access and switched one of those modes on. |
| `web_accessible_resources` (`mic.html`) | Chrome will not show the microphone prompt inside a side panel, so voice input opens this one-purpose page to ask for it once. It requests access, releases the device immediately and does nothing else. |

### Host permissions

| Origin | Why it is needed |
|---|---|
| `https://api.groq.com/*`, `https://api.cloudflare.com/*`, `https://generativelanguage.googleapis.com/*` | When the user has added their own key, requests go directly from the browser to that provider. This keeps the key out of any intermediary. |
| The extension's own website origin | Sign-in, syncing the user's keys and conversations, and reporting usage counts. **Replace `http://localhost:3000/*` with the production origin before publishing.** |

### Optional host permissions — expect a closer review

`http://*/*` and `https://*/*` are under `optional_host_permissions`, so **nothing is granted at
install**. The first time the user switches page reading or Act mode on, the extension calls
`chrome.permissions.request` for all sites, from inside that click — Chrome shows its own prompt, and
declining turns the control back off.

It asks for all sites at once, rather than site by site, because Chrome has no per-tab grant: a
per-origin request meant a new prompt on every domain, and Act mode moves between domains by design.
Chrome's review guidance names patterns like `https://*/*` as a reason for a longer review. That is
expected here; the justification is that access is optional, requested only by the user's own
action, and used only for the page they are asking about. `scripts/check-extension.mjs` fails the
build if a broad pattern is ever moved into `host_permissions`.

## Data disclosures

Answer the dashboard's data-use form as follows. Where a box is borderline, it is ticked: an item is
removed for disclosing too little, never for disclosing too much.

- **Personally identifiable information** — collected. The email address used to sign in, for
  authentication.
- **Authentication information** — collected. Provider API keys the user chooses to add, encrypted at
  rest on the server, and cached in the extension so it can call providers directly.
- **User activity** — collected. Which provider answered, the model, token counts, latency, HTTP
  status and a timestamp, per request. Never the text.
- **Website content** — collected at the user's request only. With page reading on, the page's text
  is sent to the model provider the user chose. In Act mode, each step sends that provider a list of
  the page's controls with their labels and current values, and the page's address without its query
  string. Password fields, fields named like a secret and anything shaped like a card number are
  withheld. Chats are saved to the user's own database if they connect one, or — as a trial — the
  last 20 messages in ours; nothing from Act mode is.
- **Personal communications** — tick it. The extension does not seek out mail or messages, but if the
  user opens their webmail and asks about it, or acts on it, that content goes to the model provider.
- **Audio** — collected only while the user is recording. Sent to the transcription provider and
  never stored; only the resulting text is kept, and only if the user sends it.
- **Health, financial, location, web history** — not collected. The tab's title and address are read
  to label the panel and are not recorded as a history.

Certifications to tick:

- Data is not sold to third parties.
- Data is used only for the item's single purpose.
- Data is not used to determine creditworthiness or for lending.

A conversation's text is sent to the model provider that answers it, and Google Gemini's free tier
keeps it for training and human review. That is on the website's privacy page and in the description
above, and must stay in both.

## Privacy policy URL

`https://<your-domain>/privacy` — required, because the extension handles authentication information
and website content. It must be the deployed page, reachable without signing in.
