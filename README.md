<div align="center">

![Pelegram](README%20files/README.png)

# Pelegram

**Real-time chat, reimagined. Built with Angular.**

[![Angular Version][angular-shield]][angular-url]
[![Node.js Version][nodejs-shield]][nodejs-url]
[![TypeScript][typescript-shield]][typescript-url]
[![Socket.IO Shield][socketio-shield]][socketio-url]
[![License: MIT][license-shield]][license-url]

[Live demo](https://pelegram.netlify.app/) &nbsp;·&nbsp;
[Getting started](#-getting-started) &nbsp;·&nbsp;
[Architecture](docs/ARCHITECTURE.md) &nbsp;·&nbsp;
[Contributing](CONTRIBUTING.md)

</div>

---

A feature-rich, real-time web chat application inspired by Telegram, built from the
ground up with Angular on the front end and Node.js, Express, Socket.IO, and MongoDB
behind it. It has been a challenging journey bringing this to life, and I am glad to
share it.

## ✨ Features

| | |
| :-- | :-- |
| 📱 **Real-time messaging** | Instant delivery and updates over Socket.IO |
| 👤 **Authentication** | Registration and login with JWT access and refresh tokens |
| 👀 **Presence** | Online status and last seen |
| ✔️ **Message status** | Sent, delivered, and read receipts |
| ✏️ **Edit and delete** | Fix a typo or remove a message entirely |
| ↪️ **Forwarding** | Move messages between chats, keeping the original sender |
| 💬 **Threaded replies** | Quote a message, tap the quote to jump back to it |
| 😀 **Reactions** | React to any message, grouped by emoji |
| 👥 **Group chats** | Create groups, manage participants, admin controls |
| 📎 **Media** | Images, video, audio recording, and file attachments |
| 🔍 **Search** | Find users, chats, and messages within a conversation |
| 📌 **Pinned messages** | Keep the important one at the top |
| 🖼️ **Profiles and avatars** | Clickable names and avatars, editable profile |
| 🎨 **Themes** | Light and dark mode |
| 📜 **Infinite scroll** | Message history loads as you scroll up |

![Main GIF](README%20files/Main.gif)

## 🌐 Live demo

A live version is deployed and open to try: **[pelegram.netlify.app](https://pelegram.netlify.app/)**

| Piece | Where |
| :-- | :-- |
| Frontend (Angular) | [Netlify](https://pelegram.netlify.app/) |
| Backend (Node.js) | [Render](https://render.com/) |
| Database | [MongoDB Atlas](https://www.mongodb.com/) |

Register an account and start chatting. Two things to know about the free hosting:

> **Cold starts.** The backend sleeps after 15 minutes of inactivity. The first
> request after that (a login, say) can take 30 to 50 seconds while the instance
> wakes up. Everything after it is fast.

> **Media persistence.** Uploads once lived on the server's ephemeral filesystem and
> disappeared on every restart. This is now solved: files go to Cloudinary in
> production, so they persist.

## 🛠 Tech stack

**Frontend**
Angular 20 (standalone components, `OnPush`), TypeScript, RxJS, Socket.IO client, SCSS

**Backend**
Node.js, Express 5, Socket.IO, MongoDB with Mongoose, Zod for request and environment
validation, JWT authentication

**Tooling**
ESLint, Karma and Jasmine, `node:test` with an in-memory MongoDB, GitHub Actions

## 🚀 Getting started

### Prerequisites

- **Node.js** 20 or newer (22 LTS recommended). CI runs both.
- **npm** 8 or newer
- **MongoDB**, either running locally or an Atlas connection string

### 1. Clone

```bash
git clone https://github.com/Pabblusansky/pelegram.git
cd Pelegram
```

### 2. Configure the server

```bash
cp server/.env.example server/.env
```

Open `server/.env` and set `SECRET_KEY`. It is **required** and must be at least 32
characters. The server validates this at startup and refuses to run with a missing or
weak value. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Every other variable has a sensible development default. See
[`server/.env.example`](server/.env.example) for the full list, including the
Cloudinary credentials that are only needed in production.

### 3. Install

From the repository root, this installs the root, client, and server at once:

```bash
npm run install-all
```

### 4. Run

```bash
npm run dev
```

This starts the API and the Angular dev server together.

- API: **http://localhost:3000**
- App: **http://localhost:4200**

Open http://localhost:4200 and you are in.

### Other commands

All run from the repository root.

```bash
npm test             # server integration tests, then client unit tests
npm run lint         # lint server and client
npm run typecheck    # type check the server
npm run build        # production build of both
npm run build-client # production build of the frontend only
```

Frontend build artifacts land in `client/dist/`.

## 🧪 Tests

| Suite | What it covers |
| :-- | :-- |
| Server | Authorization, authentication flow, message ordering and pagination, upload permissions |
| Client | Message list logic, search, text sanitizing, URL resolution, timers and listener lifecycles |

Server tests run against a real MongoDB started in memory, so no local database is
needed. The first run downloads a MongoDB binary and later runs reuse it.

## 🏗 Architecture

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for how the pieces fit together:
why the app uses both REST and Socket.IO, where authorization lives on the server,
how the chat room is split into services, and the conventions that keep it from
drifting back.

## 🤝 Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, project
layout, coding conventions, and the checks CI runs on every pull request.
Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).

Found a security issue? Please report it privately. See [SECURITY.md](SECURITY.md).

## 📜 License

MIT. See [LICENSE.md](LICENSE.md).

[angular-shield]: https://img.shields.io/badge/Angular-20-DD0031?logo=angular&logoColor=white
[angular-url]: https://angular.dev/

[typescript-shield]: https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/

[nodejs-shield]: https://img.shields.io/badge/Node.js-20%20%7C%2022-339933?logo=node.js&logoColor=white
[nodejs-url]: https://nodejs.org/

[socketio-shield]: https://img.shields.io/badge/Socket.IO-4-010101?logo=socket.io&logoColor=white
[socketio-url]: https://socket.io/

[license-shield]: https://img.shields.io/badge/License-MIT-yellow.svg
[license-url]: https://opensource.org/licenses/MIT
