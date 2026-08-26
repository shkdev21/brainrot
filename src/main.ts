import './ui/style.css';
import { GameScene } from './render/Scene';
import { buildMap } from './render/MapBuilder';
import { GameViews } from './render/GameViews';

const app = document.getElementById('app')!;
const gs = new GameScene(app);
const map = buildMap(gs.scene, ['나', '레오', '미라', '타로', '주니', '케이', '리노', '사사']);
const views = new GameViews(gs, map);
views.onToast = (msg) => console.log('[toast]', msg);
views.restoreFromSave(); // 저장이 있으면 이어하기
views.start();

// 디버그/E2E 노출
Object.assign(window, { __views: views, __game: views.game });
