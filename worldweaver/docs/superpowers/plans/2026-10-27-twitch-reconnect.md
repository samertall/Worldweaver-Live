# Twitch EventSub reconnect implementation plan

Goal: recover live chat after transient failures while preserving all existing visual design and gameplay.

Architecture: retain the single-file application. Manage active and pending sockets separately; migrate only after a replacement welcome. Fresh connections subscribe once; Twitch-directed migrations inherit subscriptions. Use bounded exponential retry delays and welcome/keepalive deadlines. Disconnect and revocation cancel all sockets and timers, and stale asynchronous work cannot restore a stopped connection.

Constraints: Node >=18, no dependencies, no CSS/rendering/gameplay changes. Tests execute the real inline functions in a Node VM with controlled external sockets and timers.

- [x] Repair the invalid smoke-test regex; run npm test to establish baseline.
- [x] Add failing reconnect regression tests: close recovery, handoff overlap/failure, silence, cancellation, stale subscription completion, permanent auth failure, malformed messages.
- [x] Implement the connection lifecycle and wire existing UI callbacks; run all tests.
- [x] Add gameplay regression tests for cooldown/deduplication, harmony and progression without changing gameplay.
- [x] Run npm run dev on 4173 and verify demo, controls, stage and reconnect behavior in Chromium; compare static design/gameplay source against baseline.
- [x] Commit, push branch and create PR: https://github.com/samertall/test/pull/1.

Review focus: old sockets closing during handoff; never-welcomed sockets; late fetch responses after disconnect; expired authorization retry loops; duplicate deliveries during overlap.

Review regressions: chat and revocation before the Helix response, stalled subscription responses despite keepalives, and reconnect requests queued during subscription creation are covered.
