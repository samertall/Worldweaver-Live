import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/<script\s+type="module">([\s\S]*?)<\/script>/i)[1];
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const welcome = id => ({ metadata: { message_type: 'session_welcome' }, payload: { session: { id, keepalive_timeout_seconds: 10 } } });
const reconnect = { metadata: { message_type: 'session_reconnect' }, payload: { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?session=replacement' } } };
const notification = { metadata: { message_type: 'notification', message_id: 'delivery-1' }, payload: { subscription: { type: 'channel.chat.message' }, event: { message_id: 'chat-1', message: { text: '!seed' }, chatter_user_login: 'fern' } } };

function setup(subscribe = async () => {}) {
  const sockets = [], timers = new Map(), states = [], messages = [], errors = [], subscriptions = [];
  let now = 0, timerId = 0;
  class WebSocket {
    constructor(url) { this.url = url; this.listeners = {}; this.closed = false; sockets.push(this); }
    addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
    emit(type, data) { for (const cb of this.listeners[type] || []) cb(data); }
    message(data) { this.emit('message', { data: JSON.stringify(data) }); }
    close() { if (!this.closed) { this.closed = true; this.emit('close', {}); } }
  }
  const context = { WebSocket, URL, setTimeout: (fn, delay) => { timers.set(++timerId, { fn, at: now + delay }); return timerId; }, clearTimeout: id => timers.delete(id) };
  const start = source.indexOf('function createEventSubConnection(');
  assert.notEqual(start, -1, 'application must manage reconnect lifecycle');
  const end = source.indexOf('\nfunction handleTwitchMessage(', start);
  const create = runInNewContext(source.slice(start, end) + '\ncreateEventSubConnection;', context);
  const client = create({ subscribe: id => { subscriptions.push(id); return subscribe(id); }, onMessage: m => messages.push(m), onStatus: (...v) => states.push(v), onFatal: error => errors.push(error) });
  async function tick(ms) {
    const target = now + ms;
    while (true) {
      const entry = [...timers].filter(([, t]) => t.at <= target).sort((a,b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      now = entry[1].at; timers.delete(entry[0]); entry[1].fn(); await flush();
    }
    now = target; await flush();
  }
  async function live() { client.start(); sockets.at(-1).message(welcome('first')); await flush(); }
  return { client, sockets, timers, states, messages, errors, subscriptions, tick, live };
}

test('fresh sessions subscribe before live; unexpected close retries and resubscribes', async () => {
  const h = setup(); await h.live();
  assert.deepEqual(h.subscriptions, ['first']); assert.equal(h.states.at(-1)[0], 'live');
  h.sockets[0].close(); await h.tick(999); assert.equal(h.sockets.length, 1);
  await h.tick(1); h.sockets[1].message(welcome('fresh')); await flush();
  assert.deepEqual(h.subscriptions, ['first', 'fresh']); assert.equal(h.states.at(-1)[0], 'live');
});

test('handoff keeps old socket until welcome and inherits subscriptions exactly once', async () => {
  const h = setup(); await h.live(); const old = h.sockets[0];
  old.message(reconnect); old.message(reconnect);
  assert.equal(h.sockets.length, 2); assert.equal(old.closed, false);
  old.message(notification); assert.equal(h.messages.length, 1);
  h.sockets[1].message(welcome('replacement')); await flush();
  assert.equal(old.closed, true); assert.deepEqual(h.subscriptions, ['first']);
  old.message(notification); assert.equal(h.messages.length, 1);
  await h.tick(1000); assert.equal(h.sockets.length, 2);
});

test('failed migration retries the reconnect URL while original socket remains usable', async () => {
  const h = setup(); await h.live(); h.sockets[0].message(reconnect);
  h.sockets[1].close(); await h.tick(1000);
  assert.equal(h.sockets[2].url, reconnect.payload.session.reconnect_url);
  assert.equal(h.sockets[0].closed, false);
  h.sockets[2].message(welcome('replacement')); await flush();
  assert.deepEqual(h.subscriptions, ['first']);
});

test('original close during migration does not race a second fresh connection', async () => {
  const h = setup(); await h.live(); h.sockets[0].message(reconnect); h.sockets[0].close();
  await h.tick(1000); assert.equal(h.sockets.length, 2);
  h.sockets[1].message(welcome('replacement')); await flush();
  assert.deepEqual(h.subscriptions, ['first']); assert.equal(h.states.at(-1)[0], 'live');
});

test('welcome timeout recovers and retry delays grow with a 30 second cap', async () => {
  const h = setup(); h.client.start(); await h.tick(10000);
  assert.equal(h.sockets[0].closed, true);
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    const count = h.sockets.length;
    await h.tick(delay - 1); assert.equal(h.sockets.length, count);
    await h.tick(1); assert.equal(h.sockets.length, count + 1);
    h.sockets.at(-1).close();
  }
});

test('keepalives and notifications extend deadline; silent sockets recover', async () => {
  const h = setup(); await h.live();
  await h.tick(9000); h.sockets[0].message({ metadata: { message_type: 'session_keepalive' } });
  await h.tick(9000); assert.equal(h.sockets.length, 1); h.sockets[0].message(notification);
  await h.tick(9000); assert.equal(h.sockets.length, 1);
  await h.tick(2000); assert.equal(h.sockets.length, 2); assert.equal(h.sockets[0].closed, true);
});

test('stop closes active and pending sockets, cancels retries, and ignores late events', async () => {
  const h = setup(); await h.live(); h.sockets[0].message(reconnect); h.client.stop();
  for (const socket of h.sockets) assert.equal(socket.closed, true);
  const count = h.states.length;
  h.sockets[1].message(welcome('late')); h.sockets[0].message(notification);
  await h.tick(60000);
  assert.equal(h.states.length, count); assert.equal(h.messages.length, 0); assert.equal(h.timers.size, 0);
});

test('late subscription success after stop cannot restore live status', async () => {
  let resolve; const h = setup(() => new Promise(r => { resolve = r; }));
  h.client.start(); h.sockets[0].message(welcome('first')); await flush();
  h.client.stop(); resolve(); await flush();
  assert.equal(h.states.some(([state]) => state === 'live'), false); assert.equal(h.timers.size, 0);
});

test('authorization errors stop retries and report the need to reconnect', async () => {
  const h = setup(async () => { throw Object.assign(new Error('Unauthorized'), { status: 401 }); });
  await h.live(); await h.tick(60000);
  assert.equal(h.errors.length, 1); assert.equal(h.sockets.length, 1); assert.equal(h.timers.size, 0);
});

test('transient subscription errors retry a fresh session', async () => {
  let calls = 0; const h = setup(async () => { if (++calls === 1) throw Object.assign(new Error('Unavailable'), { status: 503 }); });
  await h.live(); await h.tick(1000); h.sockets[1].message(welcome('fresh')); await flush();
  assert.deepEqual(h.subscriptions, ['first', 'fresh']); assert.equal(h.states.at(-1)[0], 'live');
});

test('revocation cancels both connections and notifies app once', async () => {
  const h = setup(); await h.live(); h.sockets[0].message(reconnect);
  h.sockets[0].message({ metadata: { message_type: 'revocation' }, payload: { subscription: { status: 'authorization_revoked' } } });
  await h.tick(60000);
  assert.equal(h.errors.length, 1); assert.equal(h.timers.size, 0);
  assert.ok(h.sockets.every(s => s.closed));
});

test('malformed messages cannot mark a session live or crash notification processing', async () => {
  const h = setup(); h.client.start();
  h.sockets[0].emit('message', { data: '{' }); h.sockets[0].message(null);
  h.sockets[0].message({ metadata: { message_type: 'session_welcome' }, payload: {} });
  assert.equal(h.subscriptions.length, 0);
  h.sockets[0].message(welcome('first')); await flush(); h.sockets[0].message(notification);
  assert.equal(h.messages.length, 1);
});

test('untrusted reconnect URLs cannot create sockets', async () => {
  const h = setup(); await h.live();
  for (const url of ['ws://eventsub.wss.twitch.tv/ws', 'wss://attacker.example/ws', 'wss://eventsub.wss.twitch.tv.attacker.example/ws', 'wss://user@eventsub.wss.twitch.tv/ws', 'wss://eventsub.wss.twitch.tv:444/ws', 'invalid']) {
    h.sockets[0].message({ ...reconnect, payload: { session: { reconnect_url: url } } });
  }
  assert.equal(h.sockets.length, 1); assert.equal(h.sockets[0].closed, false);
});

test('duplicate welcome cannot create duplicate subscriptions', async () => {
  let resolve; const h = setup(() => new Promise(r => { resolve = r; }));
  h.client.start(); h.sockets[0].message(welcome('first')); h.sockets[0].message(welcome('first'));
  assert.deepEqual(h.subscriptions, ['first']); resolve(); await flush();
  h.sockets[0].message(welcome('first')); assert.deepEqual(h.subscriptions, ['first']);
});

test('stop cancels an already scheduled retry', async () => {
  const h = setup(); await h.live(); h.sockets[0].close(); h.client.stop();
  await h.tick(60000); assert.equal(h.sockets.length, 1); assert.equal(h.timers.size, 0);
});

test('stale failed subscription cannot stop a newer session', async () => {
  let reject; let calls=0;
  const h = setup(() => ++calls === 1 ? new Promise((_, r) => { reject = r; }) : Promise.resolve());
  h.client.start(); h.sockets[0].message(welcome('first'));
  h.client.start(); h.sockets[1].message(welcome('second')); await flush();
  reject(Object.assign(new Error('Unauthorized'), { status: 401 })); await flush();
  assert.equal(h.errors.length, 0); assert.equal(h.sockets[1].closed, false);
  assert.equal(h.states.at(-1)[0], 'live');
});

test('chat arriving before subscription HTTP response is not lost', async () => {
  let resolve; const h = setup(() => new Promise(r => { resolve = r; }));
  h.client.start(); h.sockets[0].message(welcome('first'));
  h.sockets[0].message(notification);
  resolve(); await flush();
  assert.equal(h.messages.length, 1); assert.equal(h.messages[0].payload.event.message_id, 'chat-1');
});

test('revocation during subscription creation cancels late success', async () => {
  let resolve; const h = setup(() => new Promise(r => { resolve = r; }));
  h.client.start(); h.sockets[0].message(welcome('first'));
  h.sockets[0].message({ metadata: { message_type: 'revocation' }, payload: { subscription: { status: 'authorization_revoked' } } });
  resolve(); await flush();
  assert.equal(h.errors.length, 1); assert.equal(h.states.some(([state]) => state === 'live'), false);
  assert.equal(h.timers.size, 0);
});

test('keepalives cannot hide a stalled subscription HTTP response forever', async () => {
  const h = setup(() => new Promise(() => {}));
  h.client.start(); h.sockets[0].message(welcome('first'));
  await h.tick(9000); h.sockets[0].message({ metadata: { message_type: 'session_keepalive' } });
  await h.tick(2000);
  assert.equal(h.sockets[0].closed, true); assert.equal(h.sockets.length, 2);
  h.client.stop();
});

test('reconnect received during subscription creation starts after HTTP success', async () => {
  let resolve; const h = setup(() => new Promise(r => { resolve = r; }));
  h.client.start(); h.sockets[0].message(welcome('first')); h.sockets[0].message(reconnect);
  resolve(); await flush();
  assert.equal(h.sockets.length, 2); assert.equal(h.sockets[0].closed, false);
  h.sockets[1].message(welcome('replacement')); await flush();
  assert.equal(h.sockets[0].closed, true); assert.deepEqual(h.subscriptions, ['first']);
});
