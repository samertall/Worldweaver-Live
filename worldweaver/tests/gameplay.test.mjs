import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/<script\s+type="module">([\s\S]*?)<\/script>/i)[1];
const { parseCommand, createInitialState, applyCommand, getMissionProgress, advanceMission, sanitizeSnapshot } = runInNewContext(source.slice(0, source.indexOf('const TAU')) + '\n({parseCommand,createInitialState,applyCommand,getMissionProgress,advanceMission,sanitizeSnapshot});');

test('chat commands require a full command with supported boundaries', () => {
  for (const [input, expected] of [[' !SEED hello', 'seed'], ['!rain!', 'rain'], ['!build', 'build'], ['!spark?', 'spark'], ['!seedling', null], ['hello !rain', null], [null, null]]) assert.equal(parseCommand(input), expected);
});

test('overlapping socket deliveries do not apply the same chat message twice', () => {
  const input = { message: '!seed', username: 'fern', id: 'chat-1', source: 'twitch', at: 10000 };
  const first = applyCommand(createInitialState(), input);
  assert.equal(first.accepted, true);
  const duplicate = applyCommand(first.state, { ...input, at: 15000 });
  assert.equal(duplicate.accepted, false); assert.equal(duplicate.reason, 'duplicate');
  assert.equal(duplicate.state.total, 1); assert.equal(duplicate.state.score, 10);
});

test('per-viewer Twitch cooldown rejects before boundary and accepts at 2500 ms', () => {
  const input = { message: '!rain', username: 'fern', source: 'twitch', at: 10000 };
  const first = applyCommand(createInitialState(), { ...input, id: 'one' });
  const rejected = applyCommand(first.state, { ...input, username: 'FERN', id: 'two', at: 12499 });
  assert.equal(rejected.reason, 'cooldown'); assert.equal(rejected.state.counts.rain, 1);
  const accepted = applyCommand(first.state, { ...input, id: 'three', at: 12500 });
  assert.equal(accepted.accepted, true); assert.equal(accepted.state.counts.rain, 2);
});

test('four distinct viewers with four powers receive a single harmony bonus', () => {
  let state = createInitialState();
  ['seed', 'rain', 'build', 'spark'].forEach((command, i) => {
    state = applyCommand(state, { command, username: `viewer${i}`, at: 10000 + i * 1000 }).state;
  });
  assert.equal(state.combos, 1); assert.equal(state.score, 100); assert.equal(state.lastEvent.combo, true);
  state = applyCommand(state, { command: 'seed', username: 'fifth', at: 15000 }).state;
  assert.equal(state.combos, 1); assert.equal(state.score, 110);
});

test('chapter completion awards 250 once and advancement resets progress', () => {
  let state = createInitialState();
  assert.equal(advanceMission(state), state);
  for (const [command, count] of [['seed',4], ['rain',3], ['build',2], ['spark',3]]) {
    for (let i = 0; i < count; i++) state = applyCommand(state, { command, username: 'solo' }).state;
  }
  assert.equal(state.completed, true); assert.equal(state.score, 370); assert.equal(getMissionProgress(state).percent, 100);
  state = applyCommand(state, { command: 'seed', username: 'solo' }).state;
  assert.equal(state.score, 380);
  state = advanceMission(state);
  assert.equal(state.chapter, 1); assert.equal(state.completed, false); assert.equal(getMissionProgress(state).percent, 0);
});

test('paused worlds reject actions and snapshots constrain imported counts', () => {
  const initial = createInitialState();
  assert.equal(applyCommand({ ...initial, paused: true }, { command: 'build' }).reason, 'paused');
  assert.equal(sanitizeSnapshot(null), null);
  const restored = sanitizeSnapshot({ ...initial, counts: { seed: -10, rain: 1e9 }, stats: { seed: 999, rain: -1 } });
  assert.equal(restored.counts.seed, 0); assert.equal(restored.counts.rain, 100000);
  assert.equal(restored.stats.seed, 100); assert.equal(restored.stats.rain, 0);
});
