# Worldweaver Live

**Give your chat a world to build.** A cooperative Twitch experience where viewers grow a procedurally rendered floating island in real time. No viewer wins alone: each person helps build a shared world.

Built for the **Codex x TwitchCon Hackathon 2026**. [Official challenge](https://twitchcon-codex.devpost.com/).

## Try it in 30 seconds

1. Open `index.html` using the included local server: `npm run dev`, then visit `http://localhost:4173/`.
2. Demo mode simulates community participation every 2.3 seconds. Click any of the four power cards to contribute manually.
3. Watch the floating island change, its quest fill up, and Harmony Combos unlock when distinct players activate all four powers.
4. Click **Open stage** for a clean presentation window suitable for OBS Window Capture.
5. Open **Activity** to inspect the replay and export a JSON snapshot.

No dependencies are required for local development. Node.js 18+ is sufficient for the convenience server. You can also deploy the static files directly to any static host.

## How it works

A Twitch chat command modifies the shared world:

| Command | World effect | Quest role |
|---|---|---|
| `!seed` | Trees, flowers, a living forest | Nature |
| `!rain` | Ponds, streams, a waterfall | Water |
| `!build` | Village houses and warm windows | Shelter |
| `!spark` | Fireflies, constellations and aurora | Light |

The app has three cooperative chapters, a persistent local activity log, a contributor count, community energy, and a harmony score that rewards balanced creation. A **Harmony Combo** grants a bonus when four distinct viewers use all four commands within a short window.

## Connect an actual Twitch channel

The streamer needs a Twitch developer app, NOT a Twitch client secret.

1. Register an application at https://dev.twitch.tv/console/apps. Use **Website Integration** and add the exact redirect URI shown in Worldweaver's **Connect Twitch** dialog, e.g. `https://your-app.example/` or `http://localhost:4173/` for local testing. Add each testing URL you plan to use.
2. Copy your **Client ID** (public, not secret) into the dialog and click **Authorize with Twitch**.
3. Approve only the `user:read:chat` permission. Sign in as the broadcaster whose chat should control the world.
4. The app identifies your user via `GET /helix/users`, creates a `channel.chat.message` EventSub WebSocket subscription using the authenticated user's ID, then listens for messages in your channel.
5. Send `!seed`, `!rain`, `!build`, or `!spark` in your Twitch chat. New valid messages render live in the dashboard and stage windows.

**Security:** Twitch OAuth's browser-based implicit flow uses a CSRF `state` and the least-privilege `user:read:chat` permission. The token is stored in sessionStorage, not localStorage, URL query parameters, the app repository, or server logs. Remove it by clicking Disconnect. There are no client secrets or OpenAI API keys in the browser. A per-viewer 2.5-second cooldown and message-ID deduplication reduce chat spam.

**Twitch dependency:** Live mode requires a real Twitch account, an approved application Client ID, an exact matching OAuth redirect URI, Twitch Helix and WebSocket network access. Demo mode works without credentials or Twitch. The live integration was implemented against the official API schema but must be verified with the broadcaster's Twitch credentials before claiming a successful end-to-end on-stream demonstration.

## Streaming / OBS

Click **Open stage** to launch `/?stage=1` in a dedicated window and use **OBS Window Capture**. It has a broadcast-safe HUD, large chapter status, cooperative objective prompts, and animated environment. Use the dashboard to control chapters and inspect the feed. Both views synchronize through BroadcastChannel and origin-localStorage **when opened in the same browser profile**.

Use `/?stage=1&transparent=1` for a transparent stage background. The animated island remains visible with the transparent option. Browser Source in a separate OBS runtime may not share the same storage or authentication with your regular browser. For this hackathon build, the supported reliable method is Window Capture of the stage tab/window; a cross-process hosted overlay relay is a future extension.

## Project structure

- `index.html`: semantic dashboard, Twitch connection dialog, stage, activity view.
- `style.css`: responsive interface and presentation stage.
- `engine.mjs`: pure command parser, community progression, scoring, snapshot validation.
- `world.mjs`: entirely procedural Canvas 2D illustrated island (no remote image dependencies).
- `app.mjs`: browser app, local persistence, EventSub WebSocket client, UI controls.
- `dev-server.mjs`: zero-dependency local static server.
- `tests/engine.test.mjs`: Node's built-in test runner unit tests.
- `standalone.html`: optional compiled single-file delivery artifact with all styles and scripts inlined.

## Quality checks

```bash
npm test
npm run dev
```

Expected unit tests: command parsing, duplicate/cooldown rejection, mission progression, harmony balance, and snapshot validation.

## Codex hackathon requirement: genuine session ID

This repo and application can be used as the basis of a real **OpenAI Codex** session. To meet the hackathon's mandatory **built with Codex** rule, do substantive follow-up development and validation in Codex, not just open it. Open the repository in Codex and use a prompt such as:

> Inspect Worldweaver Live. Run the tests, debug any UI issues, verify the Twitch EventSub flow against official docs, then implement and test a meaningful improvement (e.g., improved disconnect/reconnect behavior or an accessible onboarding). Explain the changes and commit them to the repo. Then show `/status` so I can record the genuine Codex session ID.

**Do not invent a Codex session ID** or claim Codex was used if it wasn't. The real ID from the thread where most work is performed must go into Devpost. The submission also requires a public YouTube video (up to 3 minutes) showing Worldweaver working **on Twitch** and how Codex was used.

## Suggested 2:30 demo video

- **0:00-0:20**: Introduce Worldweaver and the cooperative Twitch concept.
- **0:20-0:45**: Open the Twitch stream/chat and demonstrate authorization/connected status.
- **0:45-1:35**: Send all four commands from chat and show real-time island transformations.
- **1:35-1:55**: Demonstrate a Harmony Combo, completed chapter, and the stream stage in OBS.
- **1:55-2:15**: Show replay export, viewer impact, and streamer workflow.
- **2:15-2:30**: Show the authentic Codex thread, tests or commits, and `/status`.

## Scope / known limitations

- Local-first collaborative state with BroadcastChannel; cross-device or OBS Browser Source sync needs an external persistent realtime service.
- Browser-based Twitch EventSub subscription depends on Twitch's CORS policy and supported browser OAuth flow; validate against the target Twitch environment before recording the real-channel demo.
- No chat message content is persisted by default: only recognized power commands, public display handles and minimal replay metadata. Exported replays can include viewer handles.
- Optional animated visual effects are reduced if the browser requests reduced motion.
- No artificial Twitch credentials, Codex sessions, user activity, or prerecorded live-connection claims are included.

## Technology

HTML5, CSS, Canvas 2D, ECMAScript modules, Twitch OAuth, Twitch Helix, Twitch EventSub WebSockets, localStorage, BroadcastChannel, Node.js built-in test runner. Codex verification is a distinct step before a valid hackathon submission.

## License

MIT. Created as an original prototype for the Codex x TwitchCon Hackathon.