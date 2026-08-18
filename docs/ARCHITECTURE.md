# Architecture

How Pelegram is put together, and the conventions that keep it that way. Read this
before adding a feature to the chat room or a new API route.

## The shape of the system

```
Browser (Angular 20)
   |
   |-- REST over HTTP ......... loading history, profiles, uploads, group admin
   |-- Socket.IO .............. live messages, typing, reactions, presence
   v
Express 5 + Socket.IO (Node, ESM, TypeScript)
   |
   v
MongoDB (Mongoose)
```

Both transports are used deliberately. REST handles anything that is requested once
and paginated (message history, chat lists, uploads). Socket.IO handles anything
that arrives unprompted (a new message, someone typing, a reaction). A message you
send travels over the socket; the fifty messages above it arrive over REST.

## Server

```
server/src/
  config/      env validation, logger, multer + Cloudinary storage, populate presets
  middleware/  auth, chat access guards, validation, rate limiting, error handling
  models/      Mongoose schemas
  routes/      REST endpoints
  schemas/     Zod request schemas
  socket/      real-time event handlers
```

### Configuration is validated once, at startup

`config/env.ts` parses `process.env` through a Zod schema and exits if anything
required is missing or too weak. Everything else imports `env` from there.

Never read `process.env` directly. ESM evaluates imported modules before the body of
the importing module, so a top-level `process.env` read in another file runs before
`dotenv` has loaded and silently falls back to a default. This project shipped a
`default_secret` JWT fallback to production that way once.

### Authorization has one home

Every per-chat permission check goes through `middleware/chatAccess.ts`:

| Helper | Use |
| :-- | :-- |
| `requireChatMembership(param)` | Router-chain guard. Rejects non-members, attaches `req.chat` |
| `findMemberChat(chatId, userId)` | When the chat id comes from the body, not the URL |
| `requireGroupAdmin(action)` | Group-admin-only routes. Also validates that the chat is a group |
| `isChatAdmin(chat, userId)` | The admin predicate on its own |

This exists because the same membership query was hand-written in eleven places and
was simply missing from seven of them, which is how a message-forwarding endpoint
became a way to read other people's chats. One implementation cannot be forgotten in
one place.

Two rules follow from that:

- Register authenticated routes **below** `app.use(authenticateToken)` in
  `server/src/app.ts`. Anything above that line is public.
- Put the guard **before** multer on upload routes, so a non-member cannot spend
  storage before being rejected.

### Queries project their fields

Mongoose returns whole documents by default, password hashes included. Every query
that feeds a response either passes a projection or goes through the presets in
`config/populate.ts`, which cap what participants, senders, and replies expose.

### Ordering

Messages sort by `timestamp`, never `createdAt`. Both exist on the schema and agree
today, but `timestamp` is the field the UI displays and the one the client sorts by,
and it is the field the `{ chatId: 1, timestamp: -1 }` index covers.

## Client

```
client/src/app/
  auth/      login, registration, token handling
  chat/      chat list, chat room, message input, groups, forwarding
  profile/   own profile and other users' profiles
  services/  app-wide services (logger, token, theme, sound, notifications)
  shared/    reusable components, pipes, animations, utilities
```

### The chat room and its services

`chat/chat-room/` is the largest feature in the app. The component owns the view and
the lifecycle; the work lives in services beside it:

| Service | Owns |
| :-- | :-- |
| `MessageListService` | Merging, ownership, status ordering, date dividers |
| `MessageSearchService` | Search state and result flags on messages |
| `MessageTextService` | Sanitizing and highlighting message text |
| `MediaUrlService` | Resolving file, avatar, thumbnail, and poster URLs |
| `MediaModalService` | The full-screen image preview |
| `TypingIndicatorService` | Who is typing, with expiry |
| `ScrollStabilizerService` | Settling the viewport at the bottom after renders |
| `PinnedMessageService` | Resolving the pinned message and unpin permission |
| `SelectionService` | Multi-select mode |
| `MessageActionsService` | Context menu, edit, reply, forward, pin |

**The rule: pure computation goes in a service, side effects stay in the component.**

A service returns a value. The component decides what to do with it: mutate its
arrays, call `detectChanges()`, scroll the viewport. That split is why these services
are testable at all, and it is the reason `mergeMessages` still pushes into the same
array in the component rather than having a service hand back a new one.

Services that hold per-chat state (`SelectionService`, `MessageSearchService`,
`TypingIndicatorService`, `ScrollStabilizerService`, `MediaModalService`,
`MessageActionsService`) are listed in the component's `providers`, so each chat room
gets its own instance. Stateless helpers are `providedIn: 'root'`.

Services that need component state take a context object of getters at `init()`
rather than a reference to the component. See `SelectionContext`.

### Subscriptions and listeners

Every long-lived subscription needs `takeUntil(this.destroy$)`, and every listener or
timer needs a matching teardown on **every** exit path, not just the happy one.

This is the most common bug in this codebase's history. Real examples, all fixed:

- Socket observables that registered `socket.on(...)` and returned no teardown, so
  unsubscribing could not remove them
- A `message_edited` listener registered on every message sent
- A modal that removed its Escape handler when closed by Escape, but not when closed
  by clicking
- A recording timer that survived component destruction

HTTP calls through `HttpClient` complete on their own and do not need `takeUntil`.

### Change detection

Components use `OnPush`. Lists need `trackBy`. The chat room drives change detection
manually in places because socket events arrive outside Angular's awareness.

## Testing

| | Runner | Location |
| :-- | :-- | :-- |
| Server | `node:test` against in-memory MongoDB | `server/tests/` |
| Client | Karma and Jasmine, headless Chrome | `*.spec.ts` beside the code |

Server tests run against the built output in `server/dist/`, so `npm test` builds
first. They start a real MongoDB in memory, so no local database is needed.

There is also `server/scripts/smoke.mjs`, which boots the built server and checks
that REST and Socket.IO still coexist on one HTTP server. It exists because a
refactor once broke that wiring in a way no unit test could catch.

When fixing a bug, write the test so that it fails against the old code first. Every
security fix and leak fix in this project was verified that way.

## Things that will bite you

- **`requestAnimationFrame` does not run in a hidden browser tab.** The chat room
  schedules its initial scroll-to-bottom inside one. Automated browsers usually drive
  a background tab, so this behaviour cannot be verified there.
- **`itemSize` on the virtual scroll viewport is 80px, and real rows measure 27px to
  219px.** The CDK's estimate of total list height is therefore wrong. Correcting it
  needs a foreground browser to verify.
- **Uploads behave differently per environment.** Local disk in development,
  Cloudinary in production. Test both paths when touching `multer-config.ts`.
- **Strict templates.** Typing a collection that a template iterates can break the
  build even when `tsc` passes, because the template type-checker only runs during
  `ng build`. Check the build's exit code, not its output text.
