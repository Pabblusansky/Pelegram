[![Angular Version][angular-shield]][angular-url][![Node.js Version][nodejs-shield]][nodejs-url][![Socket.IO Shield][socketio-shield]][socketio-url][![License: MIT][license-shield]][license-url][![TypeScript][typescript-shield]][typescript-url]

![Pelegram](README%20files/README.png)
# Pelegram: Reimagining real-time chat. Built with Angular.

Welcome to the Pelegram Messenger project! This is a feature-rich, real-time web chat application inspired by Telegram, built from the ground up with Angular for the frontend and a robust backend (NodeJS/Express with MongoDB). It's been challenging journey bringing this to life, and I'm excited to share it.

# ✨ Features

Pelegram aims to provide a seamless and engaging chat experience. Here's what's packed in (so far!):

📱 Real-Time Messaging: Instant message delivery and updates powered by Socket.IO.

👤 User Authentication: Secure registration and login system.

👀 Online & Last Seen Status: See when your contacts are online or their last activity.

✔️ Message Status: Track if your messages are sent, delivered, and read.

✏️ Edit & Delete Messages: Easily correct mistakes by editing your messages or remove them entirely.

↪️ Message Forwarding: Seamlessly forward messages from one chat to another, keeping the original sender's context.

💬 Threaded Replies: Reply to messages with a quote of the original for context. Tap the quote to jump to the original message.

🖼️ User Profiles & Avatars: Personalize your profile and see others' avatars. Clickable names and avatars to view profiles.

🎨 Customizable Themes: Light and Dark mode support for comfortable viewing.

📜 Infinite Scroll / Message History Loading: Smoothly load older messages as you scroll up.

🔍 User & Chat Search: Easily find users to start new conversations.

And more to come!
![Main GIF](README%20files/Main.gif)

# Live Demo & Deployment

A live version of Pelegram is deployed and available for you to try! LINK: [pelegram.netlify.app](https://pelegram.netlify.app/)

- Frontend (Angular): [pelegram.netlify.app](https://pelegram.netlify.app/) (Deployed on Netlify)

- Backend (Node.js): Deployed on [Render.com](https://render.com/)

- Database (MongoDB): [Hosted on MongoDB Atlas](https://www.mongodb.com/)

Feel free to register a new account and start chatting.
# Deployment Status & Known Limitations
Please be aware of the following limitations in the current deployed version:

    Server Spin-Down (Cold Start): The backend is hosted on Render's free tier. If the server is inactive for 15 minutes, it will "spin down" to conserve resources. The first request to an inactive server (e.g., login or sending a message) may experience a delay of 30-50 seconds while the instance wakes up. Subsequent requests will be fast. This is a characteristic of the free hosting plan.

~~Ephemeral Filesystem (Media & Avatars): The current implementation for file uploads (avatars, images, audio) saves files directly to the server's local filesystem. While this works perfectly for local development, hosting platforms like Render use an ephemeral filesystem. This means that all uploaded files will be permanently deleted whenever the server restarts or spins down due to inactivity.
What this means for you: You can upload and view media, but it may disappear after a short period of time.~~

    The professional solution (implemented!): integrate a dedicated object storage service like Cloudinary or AWS S3 to ensure persistent file storage. 
# Tech Stack

**Frontend:**
- Angular (Angular CLI)
- TypeScript
- Socket.IO Client
- SCSS for styling
- RxJS for reactive programming

**Backend:**
- Node.js
- Express.js
- MongoDB with Mongoose
- Socket.IO Server
- JWT (JSON Web Tokens) for authentication

**Development Tools:**
- npm
- VS Code
- Git

# 🚀 Getting Started

Ready to run Pelegram on your local machine? The new monorepo structure makes it easier than ever.

## Prerequisites

- **Node.js**: v18.15.0 or higher (v20.x LTS recommended)
- **npm**: v8 or higher (comes with Node.js)
- **MongoDB**: A local instance running or a connection string to a cloud instance (like MongoDB Atlas)
- **Angular CLI**: (Optional, but recommended for development) `npm install -g @angular/cli`

## 1. Clone the Repository

First, clone the project to your local machine and navigate into the project directory.

```bash
git clone https://github.com/Pabblusansky/pelegram.git
cd Pelegram
```

## 2. Setup Environment Variables (Backend)

The server reads its configuration from `server/.env`. Copy the template:

```bash
cp server/.env.example server/.env
```

Then open `server/.env` and set `SECRET_KEY`. It is **required** and must be at
least 32 characters — the server validates this at startup and refuses to run
with a missing or weak value. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Every other variable has a sensible development default. See the comments in
[`server/.env.example`](server/.env.example) for the full list, including the
Cloudinary credentials required only in production.

## 3. Install All Dependencies

From the root directory of the project (`Pelegram/`), run the install-all script. This will install dependencies for the root, the client, and the server all at once.

```bash
npm run install-all
```

## 4. Run Everything!

That's it! Now, from the root directory, run the dev script. This will start both the backend server (with nodemon) and the Angular frontend development server simultaneously.

```bash
npm run dev
```

- The backend server will start on http://localhost:3000
- The frontend application will be available at http://localhost:4200

Open your browser and navigate to **http://localhost:4200** to start using Pelegram!

## Other Useful Commands

All commands run from the root directory.

```bash
npm run build        # production build of server and client
npm run build-client # production build of the frontend only
npm test             # frontend unit tests (headless Chrome)
npm run lint         # lint server and client
npm run typecheck    # type check the server
```

Frontend build artifacts are written to `client/dist/`.

# 🤝 Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
project layout, coding conventions, and the checks CI runs on every pull request.
Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).

Found a security issue? Please report it privately — see [SECURITY.md](SECURITY.md).

# 📜 License

This project is licensed under the MIT License - see the LICENSE.md file for details.

[angular-shield]: https://img.shields.io/badge/angular-v20%2B-%23DD0031?logo=angular
[angular-url]: https://angular.io/

[typescript-shield]: https://img.shields.io/badge/typescript-v5%2B-%233178C6?logo=typescript
[typescript-url]: https://www.typescriptlang.org/

[nodejs-shield]: https://img.shields.io/badge/Node.js-v18.15+/20+-%2523339933?logo=node.js
[nodejs-url]: https://nodejs.org/

[socketio-shield]: https://img.shields.io/badge/Socket.IO-v4%2B-010101?logo=socket.io
[socketio-url]: https://socket.io/

[license-shield]: https://img.shields.io/badge/License-MIT-yellow.svg
[license-url]: https://opensource.org/licenses/MIT