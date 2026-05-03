# PUMP.TV

> A second-screen gaming proof of concept — your phone becomes the controller, your browser is the game screen.

**[Live Demo →](https://pumptv-production.up.railway.app)**

Open `/play` on a desktop or TV browser. Scan the QR code with your phone. Tap PUMP as fast as you can to inflate the balloon before the air runs out.

---

## Architecture

The core idea: the mobile device is a **pure input device**. It sends a single event and knows nothing about the game state. All logic lives on the play screen.

```
┌─────────────────────────────────────────────────────────┐
│                     Socket.IO Server                    │
│                  (session registry + relay)             │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────┐    ┌─────────────────────────────┐
│   /play  (TV/Desktop)│    │  /controller/:id   (Mobile) │
│                      │    │                             │
│  • Owns all game     │    │  • Renders: START / PUMP    │
│    state             │◄───│  • Emits: { type: "pump" }  │
│  • Renders balloon   │    │  • No game state at all     │
│  • Manages decay     │    │                             │
└──────────────────────┘    └─────────────────────────────┘
```

### WebSocket event flow

| Emitter | Event | Receiver | Purpose |
|---------|-------|----------|---------|
| Play | `create-session` | Server | Register session, get sessionId |
| Controller | `join-session` | Server | Pair with play screen |
| Server | `controller-connected` | Play | Unlock start button |
| Controller | `game-start` | Server → Play | Start the game |
| Server | `game-started` | Controller | Switch to PUMP mode |
| Controller | `pump` | Server → Play | Forward input (pure relay) |
| Server | `game-over` | Controller | Notify game ended |
| Controller | `game-reset` | Server → Play | Start a new round |
| Server | `play-disconnected` | Controller | Handle host leaving |

### Session lifecycle

```
[Play loads]
    │
    ├─ create-session ──► Server stores { playSocketId, status: "waiting" }
    │                            │
    │                     Returns sessionId + QR URL
    │
[Controller scans QR]
    │
    ├─ join-session ──► Server links controllerSocketId to session
    │                          │
    │               ◄── controller-connected ── Play shows "ready"
    │
[Controller taps START]
    │
    ├─ game-start ──► Server ──► Play starts game loop
    │                      └──► Controller switches to PUMP screen
    │
[Controller taps PUMP × N]
    │
    ├─ pump ──► Server (pure relay) ──► Play updates balloon size
    │
[Balloon reaches 100%]
    │
    ├─ Play emits game-over ──► Server ──► Controller shows "Play Again"
    │
[Controller taps PLAY AGAIN]
    │
    └─ game-reset ──► Server ──► Play resets, Controller shows START
```

---

## Game mechanics

The balloon has a size value from `0` to `100`:

- Each `pump` event: `size += 3`
- Passive decay: `size -= 1` every `140ms`
- Win condition: reach `100` before time or momentum runs out

The decay creates the pressure — you can't just spam taps, you have to maintain a rhythm. The TV screen reflects the balloon's fill, color, and glow in real time.

---

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 15 (App Router) | File-based routing for `/play` and `/controller/:id` |
| Language | TypeScript | End-to-end type safety across server and client |
| Real-time | Socket.IO | Event-based WebSocket API with auto-reconnect |
| Styling | Inline CSS-in-JS | Zero dependencies, self-contained components |
| QR | `qrcode.react` | One-line QR generation from any URL |
| Server | Custom Node.js HTTP | Needed for persistent WebSocket connections alongside Next.js |
| Deploy | Railway | Native WebSocket support, zero-config Node.js |

---

## Run locally

```bash
git clone https://github.com/salvariable/pumptv
cd pumptv
npm install
npm run dev
```

Open `http://localhost:3000` on your desktop.

To test from your phone, find your local IP:

```bash
ipconfig getifaddr en0   # macOS
```

Then open `http://<your-ip>:3000` on both devices.

---

## Project structure

```
pumptv/
├── server.ts                          # Custom HTTP + Socket.IO server
├── src/
│   ├── app/
│   │   ├── play/page.tsx              # TV/desktop game screen
│   │   └── controller/[sessionId]/   # Mobile controller
│   └── lib/
│       └── socket.ts                  # Socket.IO client singleton
```

---

## Key design decisions

**Server is a relay, not a game engine.** The server holds no game state. It only maps session IDs to socket pairs and forwards events. This means the game logic can evolve independently of the transport layer.

**Controller is input-only.** The mobile screen has no idea what the balloon size is, what the score is, or whether the game is won. It sends a `pump` event and renders its own UI state based on lifecycle events (`game-started`, `game-over`). This mirrors how physical game controllers work.

**No WebRTC.** Peer-to-peer would reduce latency but adds significant complexity (STUN/TURN servers, signaling, NAT traversal). For a second-screen use case where both devices are on the same network, a WebSocket relay through a low-latency server is more than fast enough and far easier to reason about.

---

Built as a technical prototype to demonstrate second-screen gaming architecture.
