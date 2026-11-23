import * as THREE from 'three';

// WebXR Hand Input: 25 eklem, spesifikasyondaki sırayla.
export const JOINTS = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];
const N = JOINTS.length;
const I = { wrist: 0, thumbTip: 4, indexTip: 9, middleMcp: 11, ringTip: 19, pinkyTip: 24 };

/** Quest 3 yerel el takibi: eklem pozlarını okur, ortak jest motoruna uygun biçime çevirir ve elleri çizer. */
export class XRHandTracker {
  /** @param parent eller için kullanılan grup (rig): eklem pozisyonları takip uzayında (gerçek metre) olduğundan rig'in çocuğu olmalı */
  constructor(parent) {
    this.parent = parent;
    this.cache = new WeakMap();
    this.sourceCount = 0;
    this.geo = new THREE.IcosahedronGeometry(1, 0);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, N * 2);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(0.008, 0.008, 0.008);
  }

  /** Her XR frame'inde çağrılır. Dönen dizi GestureEngine girdisidir. */
  read(frame, refSpace) {
    const hands = [];
    let slot = 0;
    let count = 0;
    if (frame && refSpace) {
      for (const src of frame.session.inputSources) {
        if (!src.hand) continue;
        count++;
        let c = this.cache.get(src);
        if (!c) {
          c = { spaces: JOINTS.map((n) => src.hand.get(n)), buf: new Float32Array(N * 16) };
          this.cache.set(src, c);
        }
        if (slot >= 2 || !c.spaces.every(Boolean)) continue;
        if (!frame.fillPoses(c.spaces, refSpace, c.buf)) continue; // eklemler henüz izlenmiyor
        const b = c.buf;
        const pt = (i) => ({ x: b[i * 16 + 12], y: b[i * 16 + 13], z: b[i * 16 + 14] });
        hands.push({
          id: src.handedness && src.handedness !== 'none' ? src.handedness : `hand${slot}`,
          keys: { wrist: pt(I.wrist), middleMcp: pt(I.middleMcp), thumbTip: pt(I.thumbTip), indexTip: pt(I.indexTip), ringTip: pt(I.ringTip), pinkyTip: pt(I.pinkyTip) },
        });
        for (let i = 0; i < N; i++) {
          this._p.set(b[i * 16 + 12], b[i * 16 + 13], b[i * 16 + 14]);
          this._m.compose(this._p, this._q, this._s);
          this.mesh.setMatrixAt(slot * N + i, this._m);
        }
        slot++;
      }
    }
    this.sourceCount = count;
    this.mesh.count = slot * N;
    this.mesh.instanceMatrix.needsUpdate = true;
    return hands;
  }

  clear() { this.mesh.count = 0; this.sourceCount = 0; }

  dispose() {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }
}
