import * as THREE from 'three';

// 씬 허브 — 렌더러, 카메라, 조명, 렌더 루프

export class GameScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private callbacks: Array<(dt: number) => void> = [];
  private clouds: THREE.Group[] = [];
  private lastTime = performance.now();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 120, 220);

    this.camera = new THREE.PerspectiveCamera(
      60, window.innerWidth / window.innerHeight, 0.1, 600,
    );
    this.camera.position.set(0, 24, 46);

    this.scene.add(new THREE.HemisphereLight(0xdff2ff, 0x6a9955, 1.05));
    const sun = new THREE.DirectionalLight(0xfff6dd, 1.45);
    sun.position.set(60, 90, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -90;
    sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 90;
    sun.shadow.camera.bottom = -90;
    sun.shadow.camera.far = 300;
    this.scene.add(sun);

    // 로블록스풍 뭉게구름 (흰 박스 클러스터)
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const cloudSpots: Array<[number, number, number, number]> = [
      [-70, 46, -60, 1.4], [30, 52, -90, 1.8], [90, 44, -20, 1.2],
      [-40, 49, 70, 1.5], [70, 47, 80, 1.3], [-100, 45, 20, 1.6], [10, 50, 110, 1.4],
    ];
    for (const [cx, cy, cz, sc] of cloudSpots) {
      const cloud = new THREE.Group();
      for (const [ox, oy, oz, w] of [
        [0, 0, 0, 10], [6, 1, 2, 7], [-6, 0.6, -1, 8], [2, 1.6, -2, 6],
      ] as const) {
        const puff = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.45, w * 0.7), cloudMat);
        puff.position.set(ox, oy, oz);
        cloud.add(puff);
      }
      cloud.position.set(cx, cy, cz);
      cloud.scale.setScalar(sc);
      cloud.userData.speed = 0.5 + Math.random() * 0.5;
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      for (const cloud of this.clouds) {
        cloud.position.x += cloud.userData.speed * dt;
        if (cloud.position.x > 160) cloud.position.x = -160;
      }
      for (const cb of this.callbacks) cb(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  onFrame(cb: (dt: number) => void): void {
    this.callbacks.push(cb);
  }
}
