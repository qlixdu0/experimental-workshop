import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureEngine, GESTURE, pinchRatios } from '../js/gestures.js';

// El boyu = 0.09 (bilek -> MCP). Oranlar el boyuna göre verilir; `scale` el büyüklüğünü değiştirir.
function hand(id, { index = 1, ring = 1, pinky = 1 } = {}, scale = 1) {
  const size = 0.09 * scale;
  const thumb = { x: 0.04 * scale, y: 0.05 * scale, z: 0 };
  const at = (r, dir) => ({ x: thumb.x + dir * r * size, y: thumb.y, z: 0 });
  return { id, keys: { wrist: { x: 0, y: 0, z: 0 }, middleMcp: { x: 0, y: size, z: 0 }, thumbTip: thumb, indexTip: at(index, 1), ringTip: at(ring, -1), pinkyTip: at(pinky, 1) } };
}
const run = (eng, hands, t) => eng.update(hands, t);

test('oranlar el boyundan bağımsız (normalize)', () => {
  const a = pinchRatios(hand('r', { index: 0.2 }, 1).keys);
  const b = pinchRatios(hand('r', { index: 0.2 }, 2.5).keys);
  assert.ok(Math.abs(a.walk - b.walk) < 1e-9);
});

test('işaret pinch -> ileri, bırakınca anında none', () => {
  const e = new GestureEngine({ onsetMs: 0 });
  assert.equal(run(e, [hand('right', { index: 0.15 })], 0).gesture, GESTURE.WALK);
  assert.equal(run(e, [hand('right', { index: 1.2 })], 16).gesture, GESTURE.NONE);
});

test('serçe -> sağ, yüzük -> sol', () => {
  const e = new GestureEngine({ onsetMs: 0 });
  assert.equal(run(e, [hand('right', { pinky: 0.15 })], 0).gesture, GESTURE.TURN_RIGHT);
  run(e, [hand('right')], 10);
  assert.equal(run(e, [hand('right', { ring: 0.15 })], 20).gesture, GESTURE.TURN_LEFT);
});

test('hysteresis: bırakma eşiği altında jest sürer, üstünde biter', () => {
  const e = new GestureEngine({ onsetMs: 0 });
  assert.equal(run(e, [hand('right', { index: 0.2 })], 0).gesture, GESTURE.WALK);
  assert.equal(run(e, [hand('right', { index: 0.4 })], 10).gesture, GESTURE.WALK); // press(0.32) üstü ama release(0.48) altı
  assert.equal(run(e, [hand('right', { index: 0.5 })], 20).gesture, GESTURE.NONE);
  assert.equal(run(e, [hand('right', { index: 0.4 })], 30).gesture, GESTURE.NONE); // yeniden basmak için press eşiği gerekir
});

test('çakışma: daha sıkı olan parmak kazanır', () => {
  const e = new GestureEngine({ onsetMs: 0 });
  assert.equal(run(e, [hand('right', { ring: 0.28, pinky: 0.12 })], 0).gesture, GESTURE.TURN_RIGHT);
});

test('başlayan jest, aynı eldeki hafif daha sıkı başka pinch ile çalınmaz', () => {
  const e = new GestureEngine({ onsetMs: 0 });
  run(e, [hand('right', { index: 0.2 })], 0);
  assert.equal(run(e, [hand('right', { index: 0.2, pinky: 0.15 })], 10).gesture, GESTURE.WALK);
});

test('onset gecikmesi: kısa temas jest sayılmaz', () => {
  const e = new GestureEngine({ onsetMs: 40 });
  assert.equal(run(e, [hand('right', { index: 0.15 })], 0).gesture, GESTURE.NONE);
  assert.equal(run(e, [hand('right', { index: 0.15 })], 50).gesture, GESTURE.WALK);
});

test('iki el: aynı anda tek jest; el kaybolunca hepsi durur', () => {
  const e = new GestureEngine({ onsetMs: 0 });
  const s = run(e, [hand('left', { index: 0.15 }), hand('right', { pinky: 0.1 })], 0);
  assert.notEqual(s.gesture, GESTURE.NONE);
  const held = s.hand;
  assert.equal(run(e, [hand('left', { index: 0.15 }), hand('right', { pinky: 0.1 })], 10).hand, held);
  assert.equal(run(e, [], 20).gesture, GESTURE.NONE);
});
