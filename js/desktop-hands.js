// Masaüstü: webcam + MediaPipe Hand Landmarker. Kütüphane yalnızca "Start Camera" ile tembel yüklenir.
const BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
// MediaPipe 21 nokta: wrist 0, thumb tip 4, index tip 8, middle MCP 9, ring tip 16, pinky tip 20
const K = { wrist: 0, middleMcp: 9, thumbTip: 4, indexTip: 8, ringTip: 16, pinkyTip: 20 };
const TIP_COLORS = { 4: '#ffffff', 8: '#4fd18b', 16: '#ffb02f', 20: '#ff5d8f' };

export class DesktopHands {
  constructor({ video, canvas, onStatus = () => {} }) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onStatus = onStatus;
    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.starting = false;
    this.lastTime = -1;
    this.hands = [];
    this.error = null;
  }

  get active() { return this.running; }

  async start() {
    if (this.running || this.starting) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Bu tarayıcı kamera erişimini desteklemiyor (HTTPS gerekir).');
    this.starting = true;
    try {
      if (!this.landmarker) {
        this.onStatus('El modeli yükleniyor…');
        this.landmarker = await this._createLandmarker();
      }
      this.onStatus('Kamera izni bekleniyor…');
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.canvas.width = this.video.videoWidth || 640;
      this.canvas.height = this.video.videoHeight || 480;
      this.lastTime = -1;
      this.running = true;
      this.onStatus('Kamera açık');
    } catch (err) {
      this.stop();
      throw err;
    } finally {
      this.starting = false;
    }
  }

  async _createLandmarker() {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
    const make = (delegate) => HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
    try { return await make('GPU'); } catch (e) { console.warn('GPU delegate başarısız, CPU kullanılıyor', e); return make('CPU'); }
  }

  /** Her render karesinde çağrılır; yeni video karesi varsa algılar. */
  read(nowMs) {
    if (!this.running || this.video.readyState < 2 || !this.landmarker) return this.hands;
    if (this.video.currentTime === this.lastTime) return this.hands;
    this.lastTime = this.video.currentTime;
    let res;
    try { res = this.landmarker.detectForVideo(this.video, nowMs); } catch (e) { console.warn('detectForVideo hatası', e); return this.hands; }

    const out = [];
    const used = new Set();
    const w = this.canvas.width, h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);
    (res.landmarks || []).forEach((lm, i) => {
      const world = res.worldLandmarks?.[i] || lm; // metrik; yoksa normalize koordinat
      // Kamera görüntüsü aynalanmadan işlendiği için MediaPipe etiketi kullanıcıya göre ters
      const raw = res.handedness?.[i]?.[0]?.categoryName === 'Left' ? 'right' : 'left';
      let id = raw;
      if (used.has(id)) id = `${raw}2`;
      used.add(id);
      const keys = {};
      for (const [name, idx] of Object.entries(K)) keys[name] = { x: world[idx].x, y: world[idx].y, z: world[idx].z || 0 };
      out.push({ id, keys });
      this._draw(lm, w, h);
    });
    this.hands = out;
    return out;
  }

  _draw(lm, w, h) {
    const c = this.ctx;
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(159,216,255,.9)';
    c.beginPath();
    for (const [a, b] of CONNECTIONS) { c.moveTo(lm[a].x * w, lm[a].y * h); c.lineTo(lm[b].x * w, lm[b].y * h); }
    c.stroke();
    lm.forEach((p, i) => {
      c.fillStyle = TIP_COLORS[i] || '#ffffff';
      c.beginPath();
      c.arc(p.x * w, p.y * h, TIP_COLORS[i] ? 5 : 3, 0, Math.PI * 2);
      c.fill();
    });
  }

  stop() {
    this.running = false;
    this.hands = [];
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    this.video.srcObject = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.onStatus('Kamera kapalı');
  }

  dispose() {
    this.stop();
    if (this.landmarker) { this.landmarker.close(); this.landmarker = null; }
  }
}
