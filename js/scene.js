import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ScaleConfig } from './locomotion.js';

const lambert = (color) => new THREE.MeshLambertMaterial({ color });

/**
 * Basit mimari test sahnesi. Tüm ölçüler GERÇEK metre ile yazılır; `modelRoot` 1/70 ile ölçekleyerek maketi oluşturur.
 * .glb/.gltf dosyaları da `loadModel` ile modelRoot altına eklenir (gerçek ölçekli modeller otomatik küçülür).
 */
export function createWorld(scene) {
  const modelRoot = new THREE.Group();
  modelRoot.name = 'modelRoot';
  modelRoot.scale.setScalar(ScaleConfig.scale);
  scene.add(modelRoot);
  const disposables = [];

  scene.background = new THREE.Color(0xcfd8e2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a96a3, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(0.3, 1, 0.5);
  scene.add(sun);

  const box = (w, h, d, x, y, z, color) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, lambert(color));
    mesh.position.set(x, y, z);
    modelRoot.add(mesh);
    disposables.push(geo, mesh.material);
    return mesh;
  };

  // Zemin + 1 m grid
  const floorGeo = new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, lambert(0xe3e0d8));
  modelRoot.add(floor);
  const grid = new THREE.GridHelper(60, 60, 0x7c8794, 0xb5bcc4);
  grid.position.y = 0.01;
  modelRoot.add(grid);
  disposables.push(floorGeo, floor.material, grid.geometry, grid.material);

  // Duvarlar ve kapı boşlukları
  const H = 3, T = 0.3, DOOR_H = 2.1, WALL = 0xf4f2ee, HEADER = 0x8b5a2b;
  const wallX = (x0, x1, z, doors = []) => {
    let cur = x0;
    for (const [a, b] of [...doors].sort((p, q) => p[0] - q[0])) {
      if (a - cur > 0.01) box(a - cur, H, T, (cur + a) / 2, H / 2, z, WALL);
      box(b - a, H - DOOR_H, T, (a + b) / 2, DOOR_H + (H - DOOR_H) / 2, z, HEADER);
      cur = b;
    }
    if (x1 - cur > 0.01) box(x1 - cur, H, T, (cur + x1) / 2, H / 2, z, WALL);
  };
  const wallZ = (z0, z1, x, doors = []) => {
    let cur = z0;
    for (const [a, b] of [...doors].sort((p, q) => p[0] - q[0])) {
      if (a - cur > 0.01) box(T, H, a - cur, x, H / 2, (cur + a) / 2, WALL);
      box(T, H - DOOR_H, b - a, x, DOOR_H + (H - DOOR_H) / 2, (a + b) / 2, HEADER);
      cur = b;
    }
    if (z1 - cur > 0.01) box(T, H, z1 - cur, x, H / 2, (cur + z1) / 2, WALL);
  };
  wallX(-8, 8, -9);                    // kuzey
  wallX(-8, 8, 1, [[-0.5, 0.5]]);      // güney, ana giriş
  wallZ(-9, 1, -8);                    // batı
  wallZ(-9, 1, 8);                     // doğu
  wallX(-8, 8, -4, [[3, 4]]);          // iç duvar, kapı
  wallZ(-9, -4, 0, [[-7, -6]]);        // arka odaları ayıran duvar, kapı

  // Farklı yüksekliklerde kutular (ön salon)
  [0.5, 0.9, 1.2, 1.8, 2.5].forEach((h, i) => box(0.8, h, 0.8, -6 + i * 1.5, h / 2, -2, [0x6c8ebf, 0x7aa6a1, 0xc5a05a, 0xb36a5e, 0x8a7bb0][i]));

  // Ölçek referansları: 1.7 m insan, 1 m küp, 0.5 m bantlı 3 m cetvel
  box(0.4, 1.4, 0.25, 4, 0.7 + 0.1, -2, 0x3b4d63);
  const headGeo = new THREE.SphereGeometry(0.11, 12, 8);
  const head = new THREE.Mesh(headGeo, lambert(0xd9a982));
  head.position.set(4, ScaleConfig.humanHeightM - 0.11, -2);
  modelRoot.add(head);
  disposables.push(headGeo, head.material);
  box(1, 1, 1, 6, 0.5, -2, 0xd64545);
  for (let i = 0; i < 6; i++) box(0.12, 0.5, 0.12, -7, 0.25 + i * 0.5, -0.5, i % 2 ? 0xffffff : 0x222222);

  // Yön işaretleri: yeşil ok (ileri = -Z), kardinal sütunlar
  const arrowGeo = new THREE.ConeGeometry(0.45, 1.4, 4).rotateX(-Math.PI / 2);
  const arrow = new THREE.Mesh(arrowGeo, lambert(0x2fbf71));
  arrow.position.set(0, 0.25, 4);
  modelRoot.add(arrow);
  disposables.push(arrowGeo, arrow.material);
  box(0.3, 2, 0.3, 0, 1, -8, 0x3a6fe0);   // kuzey -Z mavi
  box(0.3, 2, 0.3, 7, 1, -0.5, 0xe0a63a); // doğu +X turuncu
  box(0.3, 2, 0.3, -7, 1, -8, 0x9a3ae0);  // batı köşe mor
  box(0.3, 2, 0.3, 7, 1, -8, 0xe03a5a);   // doğu köşe kırmızı

  const loader = new GLTFLoader();
  /**
   * @param {string} url .glb/.gltf yolu
   * @param {{authored?: 'real'|'model', position?: number[], rotationY?: number}} opt
   *  authored 'real': model gerçek metre ile hazırlanmış (varsayılan); 'model': zaten 1:70 maket ölçeğinde.
   */
  async function loadModel(url, { authored = 'real', position = [0, 0, 0], rotationY = 0 } = {}) {
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;
    if (authored === 'model') root.scale.setScalar(1 / ScaleConfig.scale); // modelRoot ölçeğini iptal et
    root.position.fromArray(position);
    root.rotation.y = rotationY;
    modelRoot.add(root);
    return root;
  }

  const spawn = new THREE.Vector3(0, 0, 5 * ScaleConfig.scale);
  const dispose = () => disposables.forEach((d) => d.dispose());
  return { modelRoot, loadModel, spawn, dispose };
}
