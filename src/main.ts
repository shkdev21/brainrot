import { GameScene } from './render/Scene';
import { buildMap } from './render/MapBuilder';
import { baseCenter } from './core/Layout';

// 임시 부트스트랩 — Task 8 검증용 (Task 10에서 게임 통합으로 교체)

const app = document.getElementById('app')!;
const gs = new GameScene(app);
const map = buildMap(gs.scene);

// 확인용: 카메가 궤도 회전
let angle = 0;
gs.onFrame((dt) => {
  angle += dt * 0.1;
  gs.camera.position.set(Math.sin(angle) * 80, 45, Math.cos(angle) * 80);
  gs.camera.lookAt(0, 0, 0);
});

// 콘솔 검증용 노출
Object.assign(window, { __map: map, baseCenter });
