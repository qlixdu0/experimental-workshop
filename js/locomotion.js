import * as THREE from 'three';
import { GESTURE } from './gestures.js';

/**
 * Ölçek tanımı (tek kaynak).
 *  - Model dünyası: 1 sahne birimi = maketin 1 metresi. Mimari içerik gerçek metre ile çizilir
 *    ve `modelRoot.scale = 1/70` ile maket ölçeğine indirilir.
 *  - Kullanıcı: XR takip uzayı gerçek metredir. `rig` grubu da 1/70 ölçeklenir; böylece gerçek 1.60 m göz yüksekliği
 *    sahnede 1.60/70 ≈ 0.02286 birim olur ve kafa hareketleri/IPD bozulmadan aynı oranda küçülür.
 *  Kamera pozisyonu veya head pose ayrıca çarpılmaz; sadece rig ölçeklenir.
 */
export const ScaleConfig = Object.freeze({
  denominator: 70,
  scale: 1 / 70,
  humanHeightM: 1.7,
  eyeHeightM: 1.6,
  scaledEyeHeight: 1.6 / 70,
  walkSpeedMps: 1.4,          // gerçek ölçekte yürüme hızı (m/s)
  turnSpeedDegPerSec: 50,
});

export class Locomotion {
  constructor({ rig, spawn }) {
    this.rig = rig;
    this.spawn = spawn.clone();
    this.floorY = 0;
    this.walkSpeedMps = 0;   // gerçek m/s (debug)
    this.turnVel = 0;        // rad/s
    this.lastForward = new THREE.Vector3(0, 0, -1);
    this._fwd = new THREE.Vector3();
    this._pivot = new THREE.Vector3();
    this.reset();
  }

  setFloorOffset(worldY) { this.floorY = worldY; this.rig.position.y = worldY; }

  reset() {
    this.rig.position.set(this.spawn.x, this.floorY, this.spawn.z);
    this.rig.rotation.set(0, 0, 0);
    this.turnVel = 0;
    this.walkSpeedMps = 0;
  }

  get turnDegPerSec() { return THREE.MathUtils.radToDeg(this.turnVel); }

  /** @param headMatrixWorld başın (kamera) dünya matrisi */
  update(dt, state, headMatrixWorld) {
    const S = ScaleConfig;
    const e = headMatrixWorld.elements;
    this._pivot.set(e[12], e[13], e[14]);

    // Bakış yönü -> yatay düzleme izdüşüm (dikey baş hareketi yürümeyi etkilemez)
    this._fwd.set(-e[8], -e[9], -e[10]).normalize();
    if (this._fwd.x * this._fwd.x + this._fwd.z * this._fwd.z > 0.01) {
      this._fwd.y = 0;
      this.lastForward.copy(this._fwd.normalize());
    }

    // İleri: pinch bırakılınca hız anında sıfır
    const walking = state.gesture === GESTURE.WALK;
    this.walkSpeedMps = walking ? S.walkSpeedMps : 0;
    if (walking) this.rig.position.addScaledVector(this.lastForward, S.walkSpeedMps * S.scale * dt);

    // Dönüş: yumuşak hızlanma/yavaşlama (frame-rate bağımsız üstel yaklaşım)
    const dir = state.gesture === GESTURE.TURN_RIGHT ? -1 : state.gesture === GESTURE.TURN_LEFT ? 1 : 0;
    const target = dir * THREE.MathUtils.degToRad(S.turnSpeedDegPerSec);
    const k = dir !== 0 ? 10 : 25;
    this.turnVel += (target - this.turnVel) * (1 - Math.exp(-k * dt));
    if (dir === 0 && Math.abs(this.turnVel) < 1e-3) this.turnVel = 0;
    if (this.turnVel !== 0) this._yawAround(this._pivot, this.turnVel * dt);

    this.rig.position.y = this.floorY;
  }

  /** Dünya Y ekseninde, başın bulunduğu nokta etrafında döndür (yerinde dönüş hissi). */
  _yawAround(pivot, angle) {
    const rig = this.rig;
    rig.rotation.y += angle;
    const c = Math.cos(angle), s = Math.sin(angle);
    const dx = rig.position.x - pivot.x, dz = rig.position.z - pivot.z;
    rig.position.x = pivot.x + c * dx + s * dz;
    rig.position.z = pivot.z - s * dx + c * dz;
  }
}
