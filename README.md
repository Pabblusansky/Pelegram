[![Angular Version][angular-shield]][angular-url][![Node.js Version][nodejs-shield]][nodejs-url][![Socket.IO Shield][socketio-shield]][socketio-url][![License: MIT][license-shield]][license-url]

# Pelegram: Reimagining real-time chat. Built with Angular.

Welcome to the Pelegram Messenger project! This is a feature-rich, real-time web chat application inspired by Telegram, built from the ground up with Angular for the frontend and a robust backend (NodeJS/Express with MongoDB). It's been challenging journey bringing this to life, and I'm excited to share it.
# ✨ Features

Pelegram aims to provide a seamless and engaging chat experience. Here's what's packed in (so far!):

    📱 Real-Time Messaging: Instant message delivery and updates powered by Socket.IO.

    👤 User Authentication: Secure registration and login system.

    👀 Online & Last Seen Status: See when your contacts are online or their last activity.

    ✔️ Message Status: Track if your messages are sent, delivered, and read.

    ✏️ Edit & Delete Messages: Easily edit or delete your messages.

    ↪️ Message Forwarding: Seamlessly forward messages from one chat to another, keeping the original sender's context.

    🖼️ User Profiles & Avatars: Personalize your profile and see others' avatars. Clickable names and avatars to view profiles.

    🎨 Customizable Themes: Light and Dark mode support for comfortable viewing.

    📜 Infinite Scroll / Message History Loading: Smoothly load older messages as you scroll up.

    🔍 User & Chat Search: Easily find users to start new conversations.

    And more to come!

#  Tech Stack
  

Frontend:

- Angular (Angular CLI)

- TypeScript

- Socket.IO Client

- SCSS for styling

- RxJS for reactive programming

  

Backend:

- Node.js

- Express.js

- MongoDB with Mongoose

- Socket.IO Server

- JWT (JSON Web Tokens) for authentication

  

Development Tools:

- npm
- VS Code
- Git


🚀 Getting Started

Want to run Pelegram locally? Here's how:

Prerequisites:

- Node.js v18.x or higher

- npm or yarn
- MongoDB instance running
- Angular CLI: npm install -g @angular/cli


1. Clone the repository:

```bash
git clone https://github.com/Pabblusansky/pelegram.git
cd Pelegram
```
2. Setup Backend:

```bash   
cd ./server
npm install
```
### Create a .env file named secret.env containing SECRET_KEY= text_here with your secret key for password encoding.
- Run the server:
```bash
node ./server/index.js
```

- The backend server will typically start on http://localhost:3000.

3. Setup Frontend:

```bash      
cd Pelegram
npm install
npm start # or ng serve
```

- The Angular development server will typically start on http://localhost:4200.

4. Open your browser and navigate to http://localhost:4200.

# Additional information:
1. To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

📜 License

This project is licensed under the MIT License - see the LICENSE.md file for details.


      
[angular-shield]: https://img.shields.io/badge/angular-v19%2B-%23DD0031?logo=angular
[angular-url]: https://angular.io/
      
[typescript-shield]: https://img.shields.io/badge/typescript-v5%2B-%233178C6?logo=typescript
[typescript-url]: https://www.typescriptlang.org/

      
[nodejs-shield]: https://img.shields.io/badge/Node.js-v20%2B-%23339933?logo=node.js
[nodejs-url]: https://nodejs.org/

    
      
[socketio-shield]: https://img.shields.io/badge/Socket.IO-v4%2B-010101?logo=socket.io
[socketio-url]: https://socket.io/

      
[license-shield]: https://img.shields.io/badge/License-MIT-yellow.svg
[license-url]: https://opensource.org/licenses/MIT