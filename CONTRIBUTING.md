# Contributing

Thank you for looking. Issues and pull requests are welcome.

## Getting it running

The [README](README.md#quick-start) has the five commands. For the integration tests you also need a
local Postgres:

```bash
createdb zca_dev && pnpm db:push && pnpm test:db
```

## Before you open a pull request

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm ext
```

CI runs the same, plus the integration suite against Postgres and both production builds. A red CI
is the first thing a reviewer will ask about.

## The rules a change has to keep

These are the load-bearing ones. Each has a test; a change that needs to break one should say why.

- **Nothing that needs a credit card ships.** A provider or model is added only if its free tier asks
  for no payment method. `registry.test.ts` enforces it.
- **Verify a provider against its live documentation, and a live request where you can**, and record
  what you checked and when in [docs/providers.md](docs/providers.md). The docs have been wrong
  before: Gemini's pricing page still lists models the API answers with 404.
- **Every copy of the provider list agrees with the registry.** The router, the web app and the
  extension's direct mode each build their own; each has a test against `providers`.
- **Usage records never hold text.** Their fields are pinned by a test.
- **The browser agent asks before anything irreversible and never types a credential.** Read
  [docs/agent.md](docs/agent.md) before touching `apps/extension/src/lib/actions.ts` or `agent.ts`.
  Loosening a rule needs a reason, and the mutation it survives.
- **Copy tells the truth about the code.** The landing page, the privacy page and
  [store/listing.md](store/listing.md) describe what the software does. If you change what it does,
  change them in the same pull request.

## Style

- TypeScript strict, with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- Biome for formatting and lint; `pnpm format` fixes most of it.
- Plain CSS in `apps/web/src/app/globals.css`, with prefixed class names — no utility framework.
- Comments explain *why*: the constraint, the measurement, the thing that went wrong. The code already
  says what.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## Licensing of contributions

The project is under the [PolyForm Noncommercial License 1.0.0](LICENSE), and the author also offers
commercial licences. By opening a pull request you agree that your contribution is licensed under the
same terms, and that the author may also license it to others under different terms, including
commercial ones. If that does not suit you, say so in the pull request before it is merged.

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).
