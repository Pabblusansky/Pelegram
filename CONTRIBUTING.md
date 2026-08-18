# Contributing to Pelegram

Thanks for taking an interest in Pelegram. It is a hobby project, so contributions
of any size are welcome, from typo fixes to new chat features.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
For security problems, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## Getting set up

You need Node.js 20+ (22 LTS recommended), npm 8+, and a MongoDB instance
(local, or a MongoDB Atlas connection string).

```bash
git clone https://github.com/Pabblusansky/Pelegram.git
cd Pelegram
npm run install-all

cp server/.env.example server/.env
# then set SECRET_KEY in server/.env (see the comments in that file)
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Start both the API and the client:

```bash
npm run dev
```

- API: http://localhost:3000
- Client: http://localhost:4200

## Checks to run before opening a pull request

From the repository root:

```bash
npm run typecheck     # server type checking
npm run lint          # lint client and server
npm test              # server integration tests, then client unit tests
npm run build         # production build of both
```

The server tests run against a real MongoDB started in memory, so they need no
local database. The first run downloads a MongoDB binary, which takes a moment;
later runs reuse it. They live in `server/tests/` and exercise the built output
in `server/dist/`, so `npm test` builds first.

CI runs the same commands on every pull request. A red build will block a merge,
so it is worth running them locally first.

## Architecture

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) covers how the client and server fit
together, where authorization lives, how the chat room is split into services, and
the conventions behind those choices. Worth reading before a first feature.

## Project layout

```
client/   Angular 20 single-page app
  src/app/auth/       login, registration, token handling
  src/app/chat/       chat list, chat room, message input, groups
  src/app/profile/    own and other users' profiles
  src/app/services/   shared app-wide services
  src/app/shared/     reusable components, pipes, animations, utilities
server/   Express + Socket.IO + Mongoose API
  src/config/     env validation, logging, multer/Cloudinary storage
  src/middleware/ auth, chat access guards, validation, rate limiting, errors
  src/models/     Mongoose schemas
  src/routes/     REST endpoints
  src/schemas/    Zod request schemas
  src/socket/     real-time event handlers
```

## Conventions

**Commits** follow the existing style in the history:

```
feat: add reaction picker to message context menu
fix: prevent duplicate socket listeners on reconnect
docs: clarify Cloudinary setup
refactor: extract message actions into a service
```

**Code style**

- TypeScript everywhere, on both client and server. `strict` is on, so please keep
  it that way rather than reaching for `any`.
- The server is ESM. Relative imports need the `.js` extension even in `.ts`
  files (`import x from './thing.js'`), which is how Node 16 module resolution
  works.
- Angular components are standalone. Prefer `OnPush` change detection and
  `trackBy` on lists. Several components were migrated for performance and
  new code should match.
- Use the shared logger (`server/src/config/logger.ts`, and the client logger)
  rather than `console.*`.

## Things to be careful about

A few areas have bitten this project before:

- **Reading configuration.** Read environment variables through
  `server/src/config/env.ts`, never `process.env` directly. ESM evaluates
  imported modules before the importing module's body, so a top-level
  `process.env` read in another file runs before `dotenv` has loaded and
  silently picks up a fallback.
- **Route ordering.** `app.use(authenticateToken)` in `server/src/app.ts`
  protects everything registered *after* it. A route added above that line is
  public. Add new authenticated routes below it, and project Mongoose queries to
  the fields you actually need. Never return raw user documents, which contain
  password hashes.
- **Chat permissions.** Use the guards in `server/src/middleware/chatAccess.ts`
  (`requireChatMembership`, `requireGroupAdmin`, `findMemberChat`) rather than
  writing the membership query again. On upload routes the guard goes before
  multer, so a non-member cannot spend storage before being rejected.
- **Cleanup on the client.** Long-lived subscriptions need
  `takeUntil(this.destroy$)`, and every listener or timer needs a matching teardown
  on every exit path. This is the most common bug this project has had.
- **Uploads.** Storage differs between development (local disk) and production
  (Cloudinary). Test both paths when touching `multer-config.ts`.

## Pull requests

1. Fork and branch from `master` (`feat/...`, `fix/...`).
2. Keep the change focused: one concern per PR.
3. Update the README or this file if behaviour or setup changes.
4. Fill in the pull request template and link any related issue.

Not sure whether an idea fits? Open an issue and ask first. That is cheaper than
building something that gets turned down.
