import * as THREE from 'three';
import { XRManager } from './xr-manager.js';
import { XRHandTracker } from './hand-tracking.js';
import { DesktopHands } from './desktop-hands.js';
import { GestureEngine, GESTURE } from './gestures.js';
import { Locomotion, ScaleConfig } from './locomotion.js';
import { createWorld } from './scene.js';

const $ = (id) => document.getElementById(id);
const ui = {
  vr: $('btn-vr'), camStart: $('btn-cam-start'), camStop: $('btn-cam-stop'), reset: $('btn-reset'),
  preview: $('cam-preview'), video: $('cam-video'), overlay: $('cam-overlay'), toast: $('toast'),
};
let toastTimer = 0;
function toast(msg, ms = 6000) {
  ui.toast.textContent = msg; ui.toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { ui.toast.hidden = true; }, ms);
}
const setText = (id, t) => { const el = $(id); if (el.textContent !== t) el.textContent = t; };

// --- Renderer / sahne ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const world = createWorld(scene);

// rig: kullanıcı takip uzayı (gerçek metre) -> sahne. Ölçek tek yerde: rig.scale = 1/70
const rig = new THREE.Group();
rig.name = 'rig';
rig.scale.setScalar(ScaleConfig.scale);
scene.add(rig);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500); // near/far rig-yerel (gerçek) metre
camera.position.set(0, ScaleConfig.eyeHeightM, 0); // sadece masaüstü; XR'da gerçek baş pozu kullanılır
rig.add(camera);

// --- 3D durum göstergesi (kameraya bağlı, görüşü kapatmaz): sol dönüş · ileri · sağ dönüş + takip noktası ---
const hud = new THREE.Group();
hud.position.set(0, -0.24, -0.7);
camera.add(hud);
const hudGeo = new THREE.SphereGeometry(0.012, 12, 8);
const hudMats = {};
const mkDot = (name, x, y) => {
  const m = new THREE.MeshBasicMaterial({ color: 0x4a5a6b, depthTest: false });
  const mesh = new THREE.Mesh(hudGeo, m);
  mesh.position.set(x, y, 0); mesh.renderOrder = 999;
  hud.add(mesh); hudMats[name] = m;
};
mkDot(GESTURE.TURN_LEFT, -0.04, 0); mkDot(GESTURE.WALK, 0, 0); mkDot(GESTURE.TURN_RIGHT, 0.04, 0); mkDot('tracking', 0, 0.035);
const HUD_ON = { [GESTURE.WALK]: 0x4fd18b, [GESTURE.TURN_LEFT]: 0xffb02f, [GESTURE.TURN_RIGHT]: 0xffb02f };
function updateHud(state) {
  for (const g of [GESTURE.WALK, GESTURE.TURN_LEFT, GESTURE.TURN_RIGHT]) hudMats[g].color.setHex(state.gesture === g ? HUD_ON[g] : 0x4a5a6b);
  hudMats.tracking.color.setHex(state.handsTracked.length ? 0x4fd18b : 0xff5d5d);
}

// --- Sistemler ---
const gestures = new GestureEngine();
const loco = new Locomotion({ rig, spawn: world.spawn });
const xrHands = new XRHandTracker(rig);
const desktop = new DesktopHands({ video: ui.video, canvas: ui.overlay, onStatus: (s) => { camStatus = s; } });
let camStatus = 'Kamera kapalı';

const xr = new XRManager(renderer, {
  onWarn: (m) => toast(m),
  onStart: ({ floorless }) => {
    desktop.stop();                       // webcam işleyicisi XR ile çakışmasın
    ui.preview.hidden = true;
    gestures.reset();
    loco.setFloorOffset(floorless ? ScaleConfig.scaledEyeHeight : 0); // 'local' alanında göz yüksekliği eklenir
    if (floorless) toast('Zemin referansı yok: standart 1.60 m göz yüksekliği varsayıldı.');
    syncButtons();
  },
  onEnd: () => {
    xrHands.clear();
    gestures.reset();
    loco.setFloorOffset(0);
    camera.position.set(0, ScaleConfig.eyeHeightM, 0);
    camera.quaternion.identity(); camera.scale.set(1, 1, 1);
    look.yaw = 0; look.pitch = 0;
    onResize();
    syncButtons();
  },
});

function syncButtons() {
  const inVR = xr.presenting;
  ui.vr.disabled = !xr.supported || inVR;
  ui.camStart.disabled = inVR || desktop.active || desktop.starting;
  ui.camStop.disabled = !desktop.active;
}

// --- Masaüstü bakış (fare/dokunma sürükleme) ---
const look = { yaw: 0, pitch: 0, dragging: false };
renderer.domElement.addEventListener('pointerdown', (e) => { look.dragging = true; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointerup', () => { look.dragging = false; });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!look.dragging || xr.presenting) return;
  look.yaw -= e.movementX * 0.004;
  look.pitch = THREE.MathUtils.clamp(look.pitch - e.movementY * 0.004, -1.4, 1.4);
});

// --- Butonlar ---
ui.vr.addEventListener('click', async () => {
  try { await xr.enter(); } catch (err) { console.error(err); toast(`VR oturumu başlatılamadı: ${err.message || err}`); }
  syncButtons();
});
ui.camStart.addEventListener('click', async () => {
  const ok = window.confirm('Masaüstü el takibi için web kameranız açılacak. Görüntü yalnızca bu cihazda işlenir ve hiçbir yere gönderilmez. Devam edilsin mi?');
  if (!ok) return;
  syncButtons();
  try {
    ui.camStart.disabled = true;
    await desktop.start();
    ui.preview.hidden = false;
  } catch (err) {
    console.error(err);
    ui.preview.hidden = true;
    toast(err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      ? 'Kamera erişimi reddedildi. Tarayıcı adres çubuğundan izin verip tekrar deneyin.'
      : `Kamera başlatılamadı: ${err.message || err}`);
  }
  syncButtons();
});
ui.camStop.addEventListener('click', () => { desktop.stop(); ui.preview.hidden = true; gestures.reset(); syncButtons(); });
ui.reset.addEventListener('click', () => loco.reset());

function onResize() {
  if (xr.presenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// İsteğe bağlı model: ?model=assets/models/bina.glb&authored=real|model
const params = new URLSearchParams(location.search);
if (params.get('model')) {
  world.loadModel(params.get('model'), { authored: params.get('authored') === 'model' ? 'model' : 'real' })
    .catch((e) => toast(`Model yüklenemedi: ${e.message || e}`));
}

// --- Döngü ---
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, dbgAcc = 0, lastState = { gesture: GESTURE.NONE, hand: null, held: [], handsTracked: [] };

function headMatrix() {
  if (renderer.xr.isPresenting) return renderer.xr.getCamera().matrixWorld;
  camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
  camera.updateWorldMatrix(true, false);
  return camera.matrixWorld;
}

renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const presenting = renderer.xr.isPresenting;

  let hands = [];
  if (presenting) {
    hands = xrHands.read(frame, renderer.xr.getReferenceSpace());
    xr.noteHands(xrHands.sourceCount);
  } else if (desktop.active) {
    hands = desktop.read(time);
  }
  const state = gestures.update(hands, time);
  loco.update(dt, state, headMatrix());
  updateHud(state);
  lastState = state;
  renderer.render(scene, camera);

  frames++; fpsAcc += dt; dbgAcc += dt;
  if (dbgAcc >= 0.25) {
    setText('dbg-fps', String(Math.round(frames / fpsAcc)));
    frames = 0; fpsAcc = 0; dbgAcc = 0;
    const s = lastState;
    setText('dbg-xr', presenting ? `aktif (${xr.floorless ? 'local' : 'local-floor'})` : xr.supported ? 'kapalı' : `desteklenmiyor`);
    setText('dbg-hand', presenting ? `XR · ${s.handsTracked.length} el izleniyor` : desktop.active ? `Webcam · ${s.handsTracked.length} el` : camStatus);
    setText('dbg-active', s.hand || '—');
    setText('dbg-pinch', s.held.length ? s.held.map((h) => `${h.gesture} ${h.ratio.toFixed(2)}`).join(', ') : '—');
    setText('dbg-walk', `${loco.walkSpeedMps.toFixed(1)} m/s (${(loco.walkSpeedMps * ScaleConfig.scale).toFixed(3)} birim/s)`);
    setText('dbg-turn', `${loco.turnDegPerSec.toFixed(0)} °/s`);
    setText('dbg-scale', `1:${ScaleConfig.denominator}`);
  }
});

// --- Başlatma ve temizlik ---
xr.init().then(() => {
  syncButtons();
  if (!xr.supported) { ui.vr.title = xr.unsupportedReason; setText('dbg-xr', `desteklenmiyor`); console.info('WebXR:', xr.unsupportedReason); }
});
syncButtons();
window.addEventListener('pagehide', () => {
  renderer.setAnimationLoop(null);
  desktop.dispose(); xrHands.dispose(); world.dispose(); hudGeo.dispose();
  Object.values(hudMats).forEach((m) => m.dispose());
  renderer.dispose();
});
