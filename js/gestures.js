// Ortak jest motoru. Hiçbir three.js / tarayıcı bağımlılığı yoktur (Node ile test edilebilir).
// Girdi: her el için { id, keys:{wrist, middleMcp, thumbTip, indexTip, ringTip, pinkyTip} }, x/y/z metre cinsinden.
// WebXR (joint pozisyonları) ve MediaPipe (worldLandmarks) aynı biçime dönüştürülür.

export const GESTURE = Object.freeze({
  WALK: 'walk', TURN_RIGHT: 'turnRight', TURN_LEFT: 'turnLeft', NONE: 'none',
});

export const DEFAULTS = Object.freeze({
  pressRatio: 0.32,   // pinch/el-boyu oranı bunun altına inince jest başlar
  releaseRatio: 0.48, // bunun üstüne çıkınca biter (hysteresis)
  onsetMs: 40,        // jestin başlaması için gereken minimum kararlı süre
  switchMargin: 0.08, // aynı elde başka parmak bu kadar daha sıkıysa jest değişir
  minHandSize: 1e-4,
});

// başparmak ucu + hangi parmak ucu -> jest
const FINGER_GESTURES = [
  ['indexTip', GESTURE.WALK],
  ['pinkyTip', GESTURE.TURN_RIGHT],
  ['ringTip', GESTURE.TURN_LEFT],
];

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

/** El boyu: bilek -> orta parmak MCP (eklem) mesafesi. Pinch eşiklerini normalize eder. */
export function handSize(keys) {
  return dist(keys.wrist, keys.middleMcp);
}

/** Her jest için normalize pinch oranı (küçük = daha sıkı). Geçersiz el için null. */
export function pinchRatios(keys, minSize = DEFAULTS.minHandSize) {
  const size = handSize(keys);
  if (!(size > minSize)) return null;
  const out = {};
  for (const [finger, gesture] of FINGER_GESTURES) out[gesture] = dist(keys.thumbTip, keys[finger]) / size;
  return out;
}

export class GestureEngine {
  constructor(options = {}) {
    this.o = { ...DEFAULTS, ...options };
    this.reset();
  }

  reset() {
    this.pressed = new Map(); // "el:jest" -> bool (hysteresis durumu)
    this.since = new Map();   // "el:jest" -> aday olduğu ilk zaman
    this.activeKey = null;
  }

  /** @param hands izlenen eller dizisi, @param nowMs zaman (ms) */
  update(hands, nowMs) {
    const o = this.o;
    const live = new Set();
    const cands = [];

    for (const h of hands) {
      const ratios = pinchRatios(h.keys, o.minHandSize);
      if (!ratios) continue;
      for (const gesture of Object.keys(ratios)) {
        const key = `${h.id}:${gesture}`;
        const r = ratios[gesture];
        live.add(key);
        const was = this.pressed.get(key) === true;
        const now = was ? r < o.releaseRatio : r < o.pressRatio;
        this.pressed.set(key, now);
        if (now) {
          if (!this.since.has(key)) this.since.set(key, nowMs);
          cands.push({ key, hand: h.id, gesture, ratio: r });
        } else {
          this.since.delete(key);
        }
      }
    }
    // Takipten çıkan ellerin durumunu temizle -> hareket anında durur
    for (const key of [...this.pressed.keys()]) {
      if (!live.has(key)) { this.pressed.delete(key); this.since.delete(key); }
    }

    const byRatio = (a, b) => a.ratio - b.ratio;
    const eligible = cands.filter((c) => c.key === this.activeKey || nowMs - this.since.get(c.key) >= o.onsetMs);
    const cur = eligible.find((c) => c.key === this.activeKey);
    let chosen;
    if (cur) {
      // Mevcut jest tutulur; yalnızca aynı elde belirgin şekilde daha sıkı bir pinch varsa değişir.
      const better = eligible.filter((c) => c.key !== cur.key && c.hand === cur.hand && c.ratio < cur.ratio - o.switchMargin).sort(byRatio)[0];
      chosen = better || cur;
    } else {
      chosen = eligible.sort(byRatio)[0] || null;
    }
    this.activeKey = chosen ? chosen.key : null;

    return {
      gesture: chosen ? chosen.gesture : GESTURE.NONE,
      hand: chosen ? chosen.hand : null,
      ratio: chosen ? chosen.ratio : null,
      held: cands.map(({ hand, gesture, ratio }) => ({ hand, gesture, ratio })),
      handsTracked: hands.map((h) => h.id),
    };
  }
}
