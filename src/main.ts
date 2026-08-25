import './ui/style.css';
import { GameScene } from './render/Scene';
import { buildMap } from './render/MapBuilder';
import { GameViews } from './render/GameViews';

const app = document.getElementById('app')!;
const gs = new GameScene(app);
const map = buildMap(gs.scene);
const views = new GameViews(gs, map);
views.onToast = (msg) => console.log('[toast]', msg);
views.start();

// 디버그/E2E 노출
Object.assign(window, { __views: views, __game: views.game });
