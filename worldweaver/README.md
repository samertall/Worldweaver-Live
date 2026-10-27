# Worldweaver Live development

From this directory (`worldweaver/`), use Node.js 18 or later:

```sh
npm test
npm run dev
```

No dependency installation or build step is required. The development server uses port 4173 by default (`PORT` overrides it). The dashboard is at `/`; the presentation stage is at `/?stage=1`. The application remains a self-contained HTML file.

The Node test suite executes the inline production functions and covers gameplay, duplicate chat deliveries, cooldowns, harmony bonuses, mission progression, and Twitch connection lifecycle behavior. Tests simulate network sockets and time; they do not contact Twitch or require credentials.

EventSub reconnects automatically after unexpected disconnects, missing welcomes, or keepalive timeouts, with retry delays increasing from 1 second to a maximum of 30 seconds. Twitch-directed handoffs retain the old socket until the replacement is welcomed and inherit existing subscriptions; fresh sessions create a new chat subscription. Disconnect, page unload, revoked authorization, and subscription permission failures stop sockets and pending retries. The existing connection button also cancels a connection or reconnect attempt.

Demo and browser verification require no credentials. A real live-channel check still requires the broadcaster's public Twitch Client ID, an exactly registered OAuth redirect URI, user authorization, and Twitch network access. Never put access tokens in source or test fixtures. See the repository-level README for Twitch setup and streaming instructions.
