import * as THREE from 'three';
import { Game } from '../core/GameState';
import { brainrotById } from '../data/brainrots';
import { TOOLS } from '../data/tools';

const TOOL_NAMES: Record<string, string> = Object.fromEntries(TOOLS.map((t) => [t.id, t.name]));
import { MUTATION_BY_ID } from '../data/mutations';
import { displayName } from '../core/names';
import { hashStr } from '../core/rng';
import { formatMoney, instanceIncome } from '../core/Economy';
import { tryPickUp, arriveOwnBase, droppedPositions } from '../core/Carry';
import { lockBase, canEnterBase } from '../core/BaseLock';
import { useTool, purchaseTool } from '../core/ToolEffects';
import { BotBrain, type BotIntent } from '../core/Bots';
import { baseCenter, baseFront, inBaseZone, inCarpetZone, dist2d, CARPET_WALK_MS, CARPET_FROM_Z } from '../core/Layout';
import { GameScene } from './Scene';
import type { MapRefs } from './MapBuilder';
import { resolveCollisions } from './MapBuilder';
import { buildBrainrotMesh, buildAvatar, animateRainbow } from './CharacterMesh';
import { buildToolMesh } from './ToolMeshes';
import type { BaseSkin } from './MapBuilder';
import { PlayerController } from './PlayerController';
import { HUD } from '../ui/HUD';
import { Toasts } from '../ui/Toasts';
import { Shop } from '../ui/Shop';
import { RebirthPanel } from '../ui/RebirthPanel';
import { AuctionPanel } from '../ui/AuctionPanel';
import { AuctionManager } from '../core/Auction';
import { save as saveGame, load as loadGame, apply as applySave, resetSave } from '../core/Save';
import { Sfx } from '../audio/Sfx';

// 통합 계층 — core 시뮬레이션(20Hz)과 렌더링(rAF)을 잇는 모든 뷰 로직.

const BOT_COLORS = [0xe17055, 0x00b894, 0x0984e3, 0x6c5ce7, 0xd63031, 0xfdcb6e, 0xe84393];

interface BrainrotView {
  uid: string;
  visual: ReturnType<typeof buildBrainrotMesh>;
  label: THREE.Sprite;
  coin: THREE.Mesh;
  /** 기지까지 걷기 보간 */
  walk: { from: THREE.Vector3; to: THREE.Vector3; until: number } | null;
  /** 카펫 컨베이어 걷기 시작 시각 (carpet 상태) */
  carpetStartAt: number | null;
  /** 카펫 x 지터 (동시 스폰 겹침 방지) */
  carpetJitter: number;
}

interface BotView {
  id: string;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  brain: BotBrain;
  target: { x: number; z: number } | null;
  /** 문 경유 경로 큐 — 순서대로 밟고 소진 후 target으로 직행 */
  path: { x: number; z: number }[];
  pathFor: { x: number; z: number } | null;
}

export class GameViews {
  readonly game: Game;
  private player: PlayerController;
  private brainrotViews = new Map<string, BrainrotView>();
  private botViews: BotView[] = [];
  private labelCache = new Map<string, THREE.Sprite>();
  private coinGeo = new THREE.TetrahedronGeometry(0.22);
  private coinMat = new THREE.MeshLambertMaterial({ color: 0xffd700 });
  private trapMeshes = new Map<string, THREE.Mesh>();
  private turretMeshes = new Map<string, THREE.Group>();
  private hud: HUD;
  private toasts: Toasts;
  private auction: AuctionManager;
  private auctionDisplay: ReturnType<typeof buildBrainrotMesh> | null = null;
  readonly sfx = new Sfx();
  private saveTimer: number | null = null;
  private lastSignText = new Map<number, string>();
  private equipped: { toolId: string; group: THREE.Group } | null = null;
  private swingAt = 0;
  private lastFullWarnAt = 0;
  private interactHint: HTMLDivElement;
  private hintTick = 0;
  private objectiveEl: HTMLDivElement;
  private objectiveStep = 0;
  private lastRaidToastAt = 0;
  onToast: (msg: string) => void = () => {};

  constructor(
    private gs: GameScene,
    private map: MapRefs,
    seed?: number,
  ) {
    this.game = new Game({ seed });

    // 플레이어 — 자기 기지 문 앞에서 시작
    this.player = new PlayerController(
      gs.camera, gs.renderer.domElement, map.colliders, map.groundHeight, 0x74b9ff,
    );
    const door0 = map.doorCenter(0);
    // 자기 기지 문 앞 보도에서 북쪽 카펫 게이트를 바라봄
    this.player.teleportTo(door0.x + 2.5, door0.z);
    this.player.camYaw = Math.atan2(0 - (door0.x + 2.5), (CARPET_FROM_Z + 6) - door0.z);
    gs.scene.add(this.player.mesh);

    // 봇 아바타 — 전면 전시장(차단벽 앞쪽)에 스폰
    for (let i = 1; i < 8; i++) {
      const id = `b${i}`;
      const c = baseCenter(i);
      const sx = Math.sign(c.x) * 17; // 전시장 중앙 (blocker ±23.7보다 앞)
      const mesh = buildAvatar(BOT_COLORS[(i - 1) % BOT_COLORS.length]);
      mesh.position.set(sx, 0, c.z);
      gs.scene.add(mesh);
      this.botViews.push({
        id, mesh, pos: new THREE.Vector3(sx, 0, c.z),
        brain: new BotBrain(id, (seed ?? 1) * 131 + i * 977),
        target: null,
        path: [],
        pathFor: null,
      });
      this.game.state.positions[id] = { x: sx, z: c.z };
    }
    this.game.state.positions.p0 = { x: door0.x, z: door0.z };

    // 코어 이벤트 → 뷰
    const ev = this.game.events;
    ev.on('spawned', ({ uid }) => this.onSpawned(uid));
    ev.on('purchased', ({ uid, buyerId }) => {
      this.onPurchased(uid);
      if (buyerId === 'p0') this.sfx.play('buy');
    });
    ev.on('ownership-transferred', ({ uid, newOwnerId }) => {
      this.onTransferred(uid);
      if (newOwnerId === 'p0') this.sfx.play('steal');
    });
    ev.on('dropped', ({ uid }) => this.onDropped(uid));
    ev.on('despawned', ({ uid }) => this.removeView(uid));
    ev.on('locked', ({ baseId }) => {
      this.map.setBaseLocked(baseId, true);
      this.sfx.play('lock');
    });
    ev.on('unlocked', ({ baseId }) => this.map.setBaseLocked(baseId, false));
    ev.on('arrived', ({ uid }) => this.snapToSlot(uid));
    ev.on('knockback', ({ targetId, dir, force }) => {
      if (targetId === 'p0') this.player.addKnockback(dir, force);
      else {
        const bv = this.botViews.find((b) => b.id === targetId);
        if (bv) {
          bv.pos.x += dir.x * force * 0.25;
          bv.pos.z += dir.z * force * 0.25;
        }
      }
    });
    ev.on('teleported', ({ playerId, to }) => {
      if (playerId === 'p0') this.player.teleportTo(to.x, to.z);
      else {
        const bv = this.botViews.find((b) => b.id === playerId);
        if (bv) bv.pos.set(to.x, bv.pos.y, to.z);
      }
    });
    ev.on('dash', ({ playerId, dir, distance }) => {
      if (playerId === 'p0') this.player.addKnockback(dir, distance * 1.6);
    });
    ev.on('trap-placed', ({ trapId, pos }) => this.placeTrapMesh(trapId, pos));
    ev.on('trap-triggered', ({ trapId }) => this.removeTrapMesh(trapId));
    ev.on('turret-placed', ({ turretId, pos }) => this.placeTurretMesh(turretId, pos));
    ev.on('turret-expired', ({ turretId }) => this.removeTurretMesh(turretId));
    ev.on('stunned', ({ targetId }) => {
      if (targetId === 'p0') this.sfx.play('stunned');
    });
    ev.on('rebirth-done', ({ playerId }) => {
      if (playerId === 'p0') {
        this.sfx.play('rebirth');
        this.applyBaseSkin(playerId);
      }
    });
    ev.on('auction-started', () => this.sfx.play('auction'));
    ev.on('steal-started', ({ thiefId, fromBaseId }) => {
      const base = this.game.base(fromBaseId);
      if (base && base.ownerId === 'p0' && this.game.state.timeMs - this.lastRaidToastAt > 4000) {
        this.lastRaidToastAt = this.game.state.timeMs;
        this.onToast('🚨 내 기지에서 브레인롯이 도난당하고 있어요!');
      }
      void thiefId;
    });

    // 정식 UI
    const uiRoot = document.getElementById('ui')!;
    this.toasts = new Toasts(uiRoot);
    this.onToast = (msg) => {
      const kind = /🚨|😱|💸|📦/.test(msg) ? 'warn' : 'good';
      this.toasts.show(msg, kind);
    };
    this.hud = new HUD(uiRoot);
    // 목표 안내 배너 (첫 플레이 온보딩)
    this.objectiveEl = document.createElement('div');
    this.objectiveEl.style.cssText =
      'position:fixed;top:14px;left:50%;transform:translateX(-50%);padding:9px 22px;' +
      'font-size:16px;font-weight:800;color:#ffd43b;background:rgba(20,25,35,.88);' +
      'border:2px solid rgba(255,211,59,.5);border-radius:12px;display:none;z-index:6;';
    uiRoot.appendChild(this.objectiveEl);
    this.initObjectives();
    this.interactHint = document.createElement('div');
    this.interactHint.style.cssText =
      'position:fixed;bottom:92px;left:50%;transform:translateX(-50%);padding:7px 18px;' +
      'font-size:15px;font-weight:800;color:#fff;background:rgba(20,25,35,.85);border-radius:10px;' +
      'border:1px solid rgba(255,255,255,.2);display:none;z-index:5;';
    uiRoot.appendChild(this.interactHint);
    new Shop(uiRoot, this.game, this.onToast);
    new RebirthPanel(uiRoot, this.game, this.onToast);
    this.auction = new AuctionManager(this.game, (seed ?? 1) * 7717);
    new AuctionPanel(uiRoot, this.game, this.auction, this.onToast);
    ev.on('auction-started', ({ defId, startPrice }) => {
      this.onToast(`🔨 경매 시작! ${displayName(defId)} — 시작가 ${formatMoney(startPrice)}`);
      this.showAuctionDisplay(defId);
    });
    ev.on('auction-won', ({ winnerId, amount }) => {
      if (winnerId === 'p0') this.onToast(`🎉 경매 낙찰! ${formatMoney(amount)}에 획득!`);
      this.hideAuctionDisplay();
    });

    this.bindInteractions();
  }

  // ── 상호작용 바인딩 ─────────────────────────────────────

  private bindInteractions(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const p = this.game.player('p0')!;
      const now = this.game.state.timeMs;
      if (e.code === 'KeyE') this.tryInteract();
      if (e.code === 'KeyF' && now >= p.stunUntil) {
        const pad = this.map.lockPadPos(p.baseId);
        if (dist2d({ x: this.player.pos.x, z: this.player.pos.z }, { x: pad.x, z: pad.z }) < 3.5) {
          const res = lockBase(this.game, 'p0');
          if (res.ok) this.onToast('🔒 기지를 잠갔습니다 (20초)');
        }
      }
      // 도구 단축키 1~0 — 장착/해제 토글 (원작식: 장착 유지)
      const idx = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0'].indexOf(e.code);
      if (idx >= 0 && now >= p.stunUntil) {
        const toolId = p.purchasedTools[idx];
        if (toolId) this.toggleEquip(toolId);
      }
      // Q — 장착 도구 휘두르기 (미장착이면 첫 도구 자동 장착)
      if (e.code === 'KeyQ' && !e.repeat && now >= p.stunUntil) {
        if (!this.equipped && p.purchasedTools.length > 0) {
          this.toggleEquip(p.purchasedTools[0]);
        }
        this.useEquipped();
      }
    });
    // 좌클릭 — 장착한 도구 사용
    this.gs.renderer.domElement.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.useEquipped();
    });

    // 개발용 치트(임시) — M키: $10B 충전
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat) {
        this.game.player('p0')!.money += 10_000_000_000;
        this.onToast('💵 치트: $10B 충전!');
      }
    });
    // 콘솔용: __cheat.money() / __cheat.slots() / __cheat.tools() / __cheat.reset()
    Object.assign(window, { __cheat: {
      money: (n = 10_000_000_000) => { this.game.player('p0')!.money += n; },
      slots: (n = 30) => { this.game.player('p0')!.slots = n; },
      tools: () => { this.game.player('p0')!.purchasedTools = TOOLS.map((t) => t.id); },
      reset: () => { resetSave(); location.reload(); },
    } });
    // 음소거 (N키)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyN' && !e.repeat) {
        this.sfx.muted = !this.sfx.muted;
        this.onToast(this.sfx.muted ? '🔇 소리 끔' : '🔊 소리 켬');
      }
    });
    // 기지 간판 갱신 (이름 + 보유 수) — 1초 주기, 변경시만
    window.setInterval(() => this.updateBaseSigns(), 1000);

    // 자동 저장: 10초 + 종료 시
    this.saveTimer = window.setInterval(() => {
      saveGame(this.game, { x: this.player.pos.x, z: this.player.pos.z });
    }, 10000);
    window.addEventListener('beforeunload', () => {
      saveGame(this.game, { x: this.player.pos.x, z: this.player.pos.z });
    });
  }

  /** 저장 복원 — main.ts가 부팅 직후 호출 */
  restoreFromSave(): boolean {
    const data = loadGame();
    if (!data) return false;
    applySave(this.game, data);
    // 중간부터 이어하는 세이브면 온보딩 목표 미표시
    if (this.game.player('p0')!.rebirth > 0 || this.ownedCount('p0') > 0) {
      this.objectiveStep = 99;
      this.objectiveEl.style.display = 'none';
    }
    this.player.teleportTo(data.playerPos.x, data.playerPos.z);
    // 저장된 브레인롯 3D 뷰 재구축 (이벤트가 없어 뷰가 없던 문제)
    for (const inst of this.game.state.brainrots) {
      if (inst.location === 'carried') continue;
      let pos: THREE.Vector3;
      let carpetStart: number | null = null;
      if (inst.slot) {
        pos = this.map.slotPos(inst.slot.baseId, this.floorSlotIndex(inst));
        pos = pos.clone();
        pos.y = (inst.slot.floor - 1) * 4 + 0.5;
      } else if (inst.location === 'carpet') {
        pos = this.map.carpetStart.clone();
        carpetStart = this.game.state.timeMs;
      } else {
        pos = new THREE.Vector3(0, 0, 0); // dropped — 거리 중앙
      }
      this.spawnView(inst.uid, pos, carpetStart);
      if (inst.location === 'base') this.snapToSlot(inst.uid);
    }
    for (const base of this.game.state.bases) {
      this.map.setFloors(base.id, base.unlockedFloors);
      this.map.setBaseLocked(base.id, this.game.state.timeMs < base.lockedUntil);
    }
    this.applyBaseSkin('p0');
    this.updateBaseSigns();
    this.onToast('💾 저장에서 이어서 시작!');
    return true;
  }

  get saveTimerId(): number | null {
    return this.saveTimer;
  }

  private usePlayerTool(toolId: string): void {
    const aim = this.player.aimDir();
    const pos = this.player.pos;
    // 웹 슬링처럼 대상 지정이 필요한 도구: 조준 방향 근처 봇 탐색
    let targetId: string | undefined;
    let bestDot = 0.5;
    for (const b of this.botViews) {
      const dx = b.pos.x - pos.x;
      const dz = b.pos.z - pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 16) continue;
      const dot = (dx / len) * aim.x + (dz / len) * aim.z;
      if (dot > bestDot) {
        bestDot = dot;
        targetId = b.id;
      }
    }
    const res = useTool(this.game, 'p0', toolId, {
      aimDir: aim,
      pos: { x: pos.x, z: pos.z },
      targetId,
    });
    if (!res.ok && res.reason === 'on-cooldown') this.onToast('⏳ 쿨타임 중입니다');
    if (!res.ok && res.reason === 'carrying') this.onToast('🫳 운반 중에는 도구를 쓸 수 없어요');
    if (res.ok && res.hits && res.hits.length > 0) this.onToast('💥 적중!');
  }

  /** 주변 상호작용 대상 탐색 (E 힌트/실행 공용) */
  private findInteract(ppos: { x: number; z: number }): {
    kind: 'carpet' | 'steal' | 'own' | null; uid: string | null; d: number;
  } {
    const g = this.game;
    let best: { kind: 'carpet' | 'steal' | 'own' | null; uid: string | null; d: number } =
      { kind: null, uid: null, d: Infinity };
    for (const inst of g.state.brainrots) {
      if (inst.location !== 'carpet' && inst.location !== 'base' && inst.location !== 'dropped') continue;
      const view = this.brainrotViews.get(inst.uid);
      if (!view) continue;
      const d = dist2d(ppos, { x: view.visual.group.position.x, z: view.visual.group.position.z });
      const limit = inst.location === 'carpet' ? 3.4 : 3.0;
      if (d > limit || d >= best.d) continue;
      if (inst.location === 'carpet') best = { kind: 'carpet', uid: inst.uid, d };
      else if (inst.ownerId === 'p0') best = { kind: 'own', uid: inst.uid, d };
      else best = { kind: 'steal', uid: inst.uid, d };
    }
    return best;
  }

  /** E 힌트 표시 — 근처 대상이 있을 때만 */
  private updateInteractHint(ppos: { x: number; z: number }): void {
    const g = this.game;
    const p = g.player('p0')!;
    const found = this.findInteract(ppos);
    if (!found.kind || p.carrying) {
      this.interactHint.style.display = 'none';
      return;
    }
    const inst = found.uid ? g.instance(found.uid) : null;
    if (!inst) {
      this.interactHint.style.display = 'none';
      return;
    }
    let text: string;
    if (found.kind === 'carpet') {
      const def = brainrotById.get(inst.defId)!;
      text = `[E] 구매 — ${displayName(inst.defId)} ${formatMoney(def.price)}`;
    } else if (found.kind === 'steal') {
      text = `[E] 훔치기 — ${displayName(inst.defId)}`;
    } else {
      text = `내 브레인롯: ${displayName(inst.defId)}`;
    }
    this.interactHint.textContent = text;
    this.interactHint.style.display = 'block';
  }

  /** E 키 — 상황별 구매/훔치기/회수 (항상 피드백) */
  private tryInteract(): void {
    const g = this.game;
    const p = g.player('p0')!;
    if (g.state.timeMs < p.stunUntil) return;
    const ppos = { x: this.player.pos.x, z: this.player.pos.z };
    const found = this.findInteract(ppos);

    if (found.kind === 'carpet' && found.uid) {
      const res = g.buy('p0', found.uid);
      if (res.ok) {
        const inst = g.instance(found.uid)!;
        this.onToast(`🛒 ${displayName(inst.defId)} 구매!`);
      } else if (res.reason === 'not-enough-money') {
        this.onToast('💸 돈이 부족해요');
      } else if (res.reason === 'base-full') {
        this.onToast('📦 기지가 가득 찼어요 (환생 or 판매 필요)');
      }
      return;
    }

    if (found.kind === 'steal' && found.uid) {
      if (p.carrying) {
        this.onToast('🫳 이미 들고 있어요 — 내 기지로 가져가세요!');
        return;
      }
      const res = tryPickUp(g, 'p0', found.uid);
      if (res.ok) {
        const inst = g.instance(found.uid)!;
        this.onToast(`🥷 ${displayName(inst.defId)} 훔쳤다! 기지로 도망쳐!`);
      } else if (res.reason === 'base-locked') {
        this.onToast('🔒 잠긴 기지입니다');
      } else if (res.reason === 'stunned') {
        this.onToast('😵 기절 상태에요');
      }
      return;
    }

    if (found.kind === 'own') {
      this.onToast('📦 내 브레인롯이에요 — 남의 기지 것을 훔쳐보세요!');
      return;
    }

    this.onToast('🔍 주변에 브레인롯이 없어요 — 카펫이나 타 기지로 가보세요');
  }

  // ── 이벤트 핸들러 ────────────────────────────────────────

  private onSpawned(uid: string): void {
    const inst = this.game.instance(uid);
    if (!inst) return;
    // 카펫 북쪽 출입구에서 등장 — 좌우 지터로 겹침 방지
    const jitter = ((hashStr(uid) % 100) / 100 - 0.5) * 3.6;
    const start = this.map.carpetStart.clone();
    start.x += jitter;
    this.spawnView(uid, start, this.game.state.timeMs, jitter);
  }

  /** 브레인롯 3D 뷰 생성 (스폰/저장 복원 공용) */
  private spawnView(
    uid: string,
    at: THREE.Vector3,
    carpetStartAt: number | null,
    jitter = 0,
  ): void {
    if (this.brainrotViews.has(uid)) return;
    const inst = this.game.instance(uid);
    if (!inst) return;
    const def = brainrotById.get(inst.defId)!;
    const visual = buildBrainrotMesh(def.id, def.rarity, inst.mutation);
    visual.group.position.copy(at);
    visual.group.rotation.y = Math.PI;
    this.gs.scene.add(visual.group);

    const view: BrainrotView = {
      uid, visual,
      label: this.makeLabel(inst.defId, def.rarity, inst.mutation),
      coin: new THREE.Mesh(this.coinGeo, this.coinMat),
      walk: null,
      carpetStartAt,
      carpetJitter: jitter,
    };
    view.label.position.set(at.x, 2.6 * visual.group.scale.x + 0.8, at.z);
    view.coin.visible = false;
    this.gs.scene.add(view.label);
    this.gs.scene.add(view.coin);
    this.brainrotViews.set(uid, view);
  }

  private onPurchased(uid: string): void {
    const inst = this.game.instance(uid);
    const view = this.brainrotViews.get(uid);
    if (!inst || !view) return;
    view.carpetStartAt = null;
    // 기지 슬롯까지 걷기
    const to = inst.slot ? this.map.slotPos(inst.slot.baseId, this.floorSlotIndex(inst)) : new THREE.Vector3();
    view.walk = {
      from: view.visual.group.position.clone(),
      to,
      until: this.game.state.timeMs + 2000,
    };
  }

  private onTransferred(uid: string): void {
    // 훔친 브레인롯이 새 소유자 기지로 걸어감
    const inst = this.game.instance(uid);
    const view = this.brainrotViews.get(uid);
    if (!inst || !view) return;
    const holder = [...this.game.state.players].find((p) => p.carrying === null && inst.ownerId === p.id);
    void holder;
    const to = inst.slot ? this.map.slotPos(inst.slot.baseId, this.floorSlotIndex(inst)) : new THREE.Vector3();
    view.walk = {
      from: view.visual.group.position.clone(),
      to,
      until: this.game.state.timeMs + 1000,
    };
  }

  private onDropped(uid: string): void {
    const view = this.brainrotViews.get(uid);
    if (!view) return;
    // 운반자 위치에 놓기
    let dropPos = view.visual.group.position.clone();
    for (const p of this.game.state.players) {
      if (this.game.state.positions[p.id]) {
        const pp = this.game.state.positions[p.id];
        // 가장 가까운 플레이어 위치 (드롭 직후이므로 근사)
        dropPos = new THREE.Vector3(pp.x, this.map.groundHeight(pp.x, pp.z), pp.z);
        break;
      }
    }
    view.visual.group.position.copy(dropPos);
    view.label.position.set(dropPos.x, dropPos.y + 2.2, dropPos.z);
    view.coin.visible = false;
    droppedPositions.set(uid, { x: dropPos.x, z: dropPos.z });
  }

  private snapToSlot(uid: string): void {
    const inst = this.game.instance(uid);
    const view = this.brainrotViews.get(uid);
    if (!inst || !view) return;
    view.walk = null;
    const pos = inst.slot
      ? this.map.slotPos(inst.slot.baseId, this.floorSlotIndex(inst))
      : view.visual.group.position;
    view.visual.group.position.copy(pos);
    view.label.position.set(pos.x, pos.y + 2.0, pos.z);
    view.coin.visible = inst.earning;
    view.coin.position.set(pos.x + 0.5, pos.y + 1.6, pos.z);
    // 층 해금 반영
    const base = this.game.base(inst.slot!.baseId);
    if (base) this.map.setFloors(base.id, base.unlockedFloors);
  }

  private floorSlotIndex(inst: { slot: { floor: number; index: number } | null }): number {
    if (!inst.slot) return 0;
    return (inst.slot.floor - 1) * 10 + inst.slot.index;
  }

  private removeView(uid: string): void {
    const view = this.brainrotViews.get(uid);
    if (!view) return;
    this.gs.scene.remove(view.visual.group);
    this.gs.scene.remove(view.label);
    this.gs.scene.remove(view.coin);
    this.brainrotViews.delete(uid);
    droppedPositions.delete(uid);
  }

  private placeTrapMesh(id: string, pos: { x: number; z: number }): void {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.0, 0.18, 12),
      new THREE.MeshLambertMaterial({ color: 0x8d6e2f }),
    );
    mesh.position.set(pos.x, 0.15, pos.z);
    this.gs.scene.add(mesh);
    this.trapMeshes.set(id, mesh);
  }

  private removeTrapMesh(id: string): void {
    const m = this.trapMeshes.get(id);
    if (m) {
      this.gs.scene.remove(m);
      this.trapMeshes.delete(id);
    }
  }

  private placeTurretMesh(id: string, pos: { x: number; z: number }): void {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.9, 0.5, 10),
      new THREE.MeshLambertMaterial({ color: 0x556070 }),
    );
    base.position.y = 0.25;
    g.add(base);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.5, 1.0),
      new THREE.MeshLambertMaterial({ color: 0x20bf6b }),
    );
    head.position.y = 0.8;
    g.add(head);
    g.position.set(pos.x, this.map.groundHeight(pos.x, pos.z), pos.z);
    this.gs.scene.add(g);
    this.turretMeshes.set(id, g);
  }

  private removeTurretMesh(id: string): void {
    const g = this.turretMeshes.get(id);
    if (g) {
      this.gs.scene.remove(g);
      this.turretMeshes.delete(id);
    }
  }

  private makeLabel(defId: string, rarity: string, mutation: string | null): THREE.Sprite {
    const key = `${defId}|${mutation ?? ''}`;
    const cached = this.labelCache.get(key);
    if (cached) return cached.clone();

    const def = brainrotById.get(defId)!;
    const mutText = mutation ? ` ${MUTATION_BY_ID.get(mutation)!.mult}x` : '';
    const text = `${displayName(defId)}${mutText}\n${formatMoney(def.baseIncome)}/s · ${formatMoney(def.price)}`;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    const rarityColor: Record<string, string> = {
      common: '#b0b0b0', rare: '#4da6ff', epic: '#b44dff', legendary: '#ffb020',
      mythic: '#ff4d5e', god: '#39ff88', secret: '#cfcfe8',
    };
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.roundRect?.(6, 6, 500, 148, 20);
    ctx.fill();
    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = rarityColor[rarity] ?? '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(text.split('\n')[0], 256, 66);
    ctx.font = '38px sans-serif';
    ctx.fillStyle = '#ffe066';
    ctx.fillText(text.split('\n')[1], 256, 120);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(4.6, 1.45, 1);
    this.labelCache.set(key, sprite);
    return sprite.clone();
  }

  // ── 메인 루프 ────────────────────────────────────────────

  start(): void {
    // 시뮬레이션(코어 틱+봇) — rAF와 무관하게 상시 진행 (탭 비활성화에도 동작)
    window.setInterval(() => {
      const STEP = 50;
      this.game.tick(STEP);
      this.auction.update();
      this.updateBots();
      this.updateBotMovement(STEP / 1000);
      this.syncPositions();
      this.tryPlayerTransfer();
    }, 50);
    // 렌더/카메라 — rAF
    this.gs.onFrame((dt) => {
      this.updateRender(dt);
    });
  }

  private syncPositions(): void {
    this.game.state.positions.p0 = { x: this.player.pos.x, z: this.player.pos.z };
    for (const b of this.botViews) {
      this.game.state.positions[b.id] = { x: b.pos.x, z: b.pos.z };
    }
  }

  private updateBots(): void {
    const g = this.game;
    for (const bv of this.botViews) {
      const me = g.player(bv.id)!;
      if (g.state.timeMs < me.stunUntil) continue;
      const intent: BotIntent = bv.brain.update(g);
      this.applyBotIntent(bv, intent);
    }
  }

  private applyBotIntent(bv: BotView, intent: BotIntent): void {
    const g = this.game;
    const me = g.player(bv.id)!;
    const myPos = { x: bv.pos.x, z: bv.pos.z };

    if (intent.buyToolId) purchaseTool(g, bv.id, intent.buyToolId);
    if (intent.buySpawnUid && inCarpetZone(myPos, 4)) {
      const r = g.buy(bv.id, intent.buySpawnUid);
      if (r.ok) this.onToast(`🤖 ${me.name}가 브레인롯을 샀다`);
    }
    if (intent.pickUpUid && !me.carrying) {
      const target = g.instance(intent.pickUpUid);
      if (target && target.location === 'base' && target.slot) {
        if (inBaseZone(myPos, target.slot.baseId, 2)) {
          tryPickUp(g, bv.id, target.uid);
        }
      } else if (target && target.location === 'dropped') {
        tryPickUp(g, bv.id, target.uid);
      }
    }
    if (intent.lockBase && inBaseZone(myPos, me.baseId)) {
      lockBase(g, bv.id);
    }
    if (intent.useTool && !me.carrying) {
      const { toolId, targetId } = intent.useTool;
      let aim = { x: 0, z: 1 };
      if (targetId) {
        const tp = g.state.positions[targetId];
        if (tp) {
          const dx = tp.x - myPos.x;
          const dz = tp.z - myPos.z;
          const len = Math.hypot(dx, dz) || 1;
          aim = { x: dx / len, z: dz / len };
        }
      }
      useTool(g, bv.id, toolId, { aimDir: aim, pos: myPos, targetId });
    }

    // 이동 — 존이 바뀌는 목적지는 문 경유 큐 생성
    if (intent.moveTo && g.state.timeMs >= me.stunUntil) {
      bv.target = intent.moveTo;
      this.ensurePath(bv, intent.moveTo);
    }
    if (me.carrying) {
      // 귀환 — 기지 존(전시장) 진입 시 소유권 이전
      if (inBaseZone(myPos, me.baseId)) {
        if (arriveOwnBase(g, bv.id).ok) {
          bv.brain.notifyRaidEnded(g);
          this.onToast(`😱 ${me.name}가 우리 것을 훔쳐갔어요!`);
        }
      }
    }
  }

  private zoneOf(pos: { x: number; z: number }): number {
    for (let i = 0; i < 8; i++) {
      if (inBaseZone(pos, i, 0.5)) return i;
    }
    return -1;
  }

  /** 존 밖 대기 지점 — 기지 문 바깥 보도 */
  private outsidePoint(zone: number): { x: number; z: number } {
    const door = this.map.doorCenter(zone);
    return { x: door.x + (door.x > 0 ? 4 : -4), z: door.z };
  }

  /** 목적지 변경 시 경로 큐: 문 밖 → 보도 → 도착 문 밖 (벽 우회) */
  private ensurePath(bv: BotView, goal: { x: number; z: number }): void {
    if (
      bv.pathFor &&
      Math.hypot(bv.pathFor.x - goal.x, bv.pathFor.z - goal.z) < 2
    ) return; // 목적지 동일 — 경로 유지

    const fromZone = this.zoneOf({ x: bv.pos.x, z: bv.pos.z });
    const toZone = this.zoneOf(goal);
    bv.pathFor = { ...goal };
    if (fromZone === toZone) {
      bv.path = [];
      return;
    }
    const q: { x: number; z: number }[] = [];
    if (fromZone >= 0) {
      q.push(this.outsidePoint(fromZone));
      const d = this.map.doorCenter(fromZone);
      q.push({ x: Math.sign(d.x) * 11, z: d.z }); // 보도 진입
    }
    if (toZone >= 0) {
      const d = this.map.doorCenter(toZone);
      q.push({ x: Math.sign(d.x) * 11, z: d.z }); // 보도 이동
      q.push(this.outsidePoint(toZone));
    }
    bv.path = q;
  }

  private updateBotMovement(dt: number): void {
    for (const bv of this.botViews) {
      const me = this.game.player(bv.id)!;
      if (this.game.state.timeMs < me.stunUntil) {
        bv.mesh.rotation.x = 0.4;
        continue;
      }
      bv.mesh.rotation.x = 0;
      // 경로 큐 소진 → 목적지
      if (bv.path.length > 0) {
        const wp = bv.path[0];
        if (Math.hypot(bv.pos.x - wp.x, bv.pos.z - wp.z) < 2) bv.path.shift();
      }
      const goal = bv.path.length > 0 ? bv.path[0] : bv.target;
      if (goal) {
        const dx = goal.x - bv.pos.x;
        const dz = goal.z - bv.pos.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.5) {
          const speed = 5.2 * (this.game.state.timeMs < me.slowUntil ? 0.55 : 1);
          bv.pos.x += (dx / len) * speed * dt;
          bv.pos.z += (dz / len) * speed * dt;
          bv.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
      resolveCollisions(bv.pos, 0.6, this.map.colliders);
      // 차단벽 뒤(타워 지역)에 갇힌 봇 구제 — 전시장으로 복귀
      if (Math.abs(bv.pos.x) > 23.5) {
        const me2 = this.game.player(bv.id)!;
        const front = baseFront(me2.baseId);
        bv.pos.set(front.x, 0, front.z);
        bv.path = [];
        bv.pathFor = null;
      }
      bv.pos.y = this.map.groundHeight(bv.pos.x, bv.pos.z);
      bv.mesh.position.copy(bv.pos);
    }
  }

  private updateRender(dt: number): void {
    const g = this.game;
    const now = g.state.timeMs;
    const t = now / 1000;

    // 플레이어
    const p0 = g.player('p0')!;
    this.player.update(dt, p0, this.player.readInput(), now);

    // 문 통과 차단 (잠긴 타 기지)
    const ppos = { x: this.player.pos.x, z: this.player.pos.z };
    for (const base of g.state.bases) {
      if (base.ownerId === 'p0') continue;
      if (!inBaseZone(ppos, base.id, 1)) continue;
      if (canEnterBase(g, 'p0', base.id)) continue;
      // 밀어내기 — 기지 중심 반대 방향
      const c = baseCenter(base.id);
      const dx = ppos.x - c.x;
      const dz = ppos.z - c.z;
      const len = Math.hypot(dx, dz) || 1;
      this.player.pos.x += (dx / len) * 12 * dt;
      this.player.pos.z += (dz / len) * 12 * dt;
    }


    // 브레인롯 뷰 갱신
    for (const view of this.brainrotViews.values()) {
      const inst = g.instance(view.uid);
      if (!inst) continue;

      // 걷기 보간
      if (view.walk) {
        const total = Math.max(1, view.walk.until - (view.walk.until - 2000));
        void total;
        const start = view.walk.until - 2000;
        const alpha = Math.min(1, Math.max(0, (now - start) / 2000));
        view.visual.group.position.lerpVectors(view.walk.from, view.walk.to, alpha);
        // 바운스
        view.visual.group.position.y = Math.abs(Math.sin(alpha * Math.PI * 3)) * 0.3 +
          (view.walk.from.y + (view.walk.to.y - view.walk.from.y) * alpha);
        view.label.position.set(
          view.visual.group.position.x,
          view.visual.group.position.y + 2.2,
          view.visual.group.position.z,
        );
        if (now >= view.walk.until) {
          view.walk = null;
          this.snapToSlot(view.uid);
        }
      }

      // 운반 중 — 운반자 머리 위
      if (inst.location === 'carried') {
        let carrierPos: THREE.Vector3 | null = null;
        for (const p of g.state.players) {
          if (p.carrying === inst.uid) {
            carrierPos = p.id === 'p0'
              ? this.player.pos
              : this.botViews.find((b) => b.id === p.id)?.pos ?? null;
          }
        }
        if (carrierPos) {
          view.visual.group.position.set(carrierPos.x, carrierPos.y + 2.6, carrierPos.z);
          view.label.visible = false;
          view.coin.visible = false;
        }
      } else {
        view.label.visible = true;
      }

      // 조명: 수입 중 코인 회전
      if (view.coin.visible) {
        view.coin.rotation.y += dt * 3;
        view.coin.position.y = (view.visual.group.position.y + 1.6) + Math.sin(t * 2 + view.visual.bobPhase) * 0.15;
      }

      // 무지개 애니메이션
      if (view.visual.rainbowMats.length > 0) {
        animateRainbow(view.visual.rainbowMats, t, view.visual.bobPhase);
      }

      // 카펫 컨베이어 — 북쪽 출입구에서 남쪽 끝까지 걷기
      if (inst.location === 'carpet' && view.carpetStartAt !== null) {
        const prog = Math.min(1, (now - view.carpetStartAt) / CARPET_WALK_MS);
        const sx = this.map.carpetStart.x + view.carpetJitter;
        const sz = this.map.carpetStart.z;
        const ex = this.map.carpetEnd.x + view.carpetJitter;
        const ez = this.map.carpetEnd.z;
        view.visual.group.position.set(
          sx + (ex - sx) * prog,
          0.15 + Math.abs(Math.sin(prog * Math.PI * 14 + view.visual.bobPhase)) * 0.18,
          sz + (ez - sz) * prog,
        );
        view.label.position.set(
          view.visual.group.position.x,
          2.6 * view.visual.group.scale.x + 0.8,
          view.visual.group.position.z,
        );
        if (prog >= 1) {
          // 남쪽 끝 도달 — 미판매 소멸
          this.game.removeInstance(view.uid);
          this.game.events.emit('despawned', { uid: view.uid });
        }
      }
    }

    // 장착 도구 스윙 애니메이션 (장착은 유지)
    if (this.equipped) {
      const elapsed = performance.now() - this.swingAt;
      // 0~350ms: 뒤로 젖혔다가 앞으로 크게 휘두름
      this.equipped.group.rotation.x =
        elapsed < 350 ? -0.9 + Math.sin((elapsed / 350) * Math.PI) * 1.5 : -0.9;
    }

    // 상호작용 힌트 (0.15초 주기 갱신)
    this.hintTick += dt * 1000;
    if (this.hintTick > 150) {
      this.hintTick = 0;
      this.updateInteractHint(ppos);
    }

    // 레인보우 스킨 트림 색 순환
    if (this.map.rainbowMats.length > 0) {
      for (let i = 0; i < this.map.rainbowMats.length; i++) {
        this.map.rainbowMats[i].color.setHSL((t * 0.15 + i * 0.12) % 1, 0.85, 0.55);
      }
    }

    // 경매 전시 회전
    if (this.auctionDisplay) {
      this.auctionDisplay.group.rotation.y += dt * 1.2;
      this.auctionDisplay.group.position.y = 3.2 + Math.sin(t * 2) * 0.25;
    }

    // HUD 갱신
    this.hud.update(g, this.gameTotalIncome('p0'), this.ownedCount('p0'));
    this.hud.updateCooldowns(p0, now);
  }

  /** 경매 품목 전시 — 북쪽 게이트 앞 부유 회전 */
  private showAuctionDisplay(defId: string): void {
    this.hideAuctionDisplay();
    const def = brainrotById.get(defId)!;
    const visual = buildBrainrotMesh(def.id, def.rarity, null);
    visual.group.position.set(0, 3.2, -38);
    visual.group.scale.multiplyScalar(1.4);
    this.gs.scene.add(visual.group);
    this.auctionDisplay = visual;
  }

  private hideAuctionDisplay(): void {
    if (this.auctionDisplay) {
      this.gs.scene.remove(this.auctionDisplay.group);
      this.auctionDisplay = null;
    }
  }

  /** 환생 단계별 기지 스킨 — 기본→골드→다이아→레인보우 */
  applyBaseSkin(playerId: string): void {
    const p = this.game.player(playerId);
    if (!p) return;
    const skin: BaseSkin =
      p.rebirth >= 5 ? 'rainbow' :
      p.rebirth >= 3 ? 'diamond' :
      p.rebirth >= 2 ? 'gold' : 'default';
    this.map.setBaseSkin(p.baseId, skin);
  }

  /** 도구 장착 토글 — 같은 키 다시 누르면 해제 */
  private toggleEquip(toolId: string): void {
    if (this.equipped?.toolId === toolId) {
      this.player.mesh.remove(this.equipped.group);
      this.equipped = null;
      this.onToast(`🔻 ${TOOL_NAMES[toolId] ?? toolId} 해제`);
      return;
    }
    if (this.equipped) this.player.mesh.remove(this.equipped.group);
    const mesh = buildToolMesh(toolId);
    if (!mesh) return;
    mesh.position.set(0.55, 1.3, 0.25);
    mesh.rotation.set(-0.9, 0, -0.15);
    this.player.mesh.add(mesh);
    this.equipped = { toolId, group: mesh };
    this.onToast(`🔨 ${TOOL_NAMES[toolId] ?? toolId} 장착 — 좌클릭으로 사용`);
  }

  /** 장착 도구 사용 (좌클릭) */
  private useEquipped(): void {
    if (!this.equipped) return;
    this.usePlayerTool(this.equipped.toolId);
    this.swingAt = performance.now();
  }

  /** 첫 플레이 목표 시퀀스 — 진행 상황에 따라 다음 목표 표시 */
  private initObjectives(): void {
    const p = this.game.player('p0')!;
    const alreadyPlaying = p.rebirth > 0;
    if (alreadyPlaying) return;
    const steps = [
      '🛒 레드카펫에서 첫 브레인롯을 사 보세요 [E]',
      '🏏 상점[B]에서 방망이를 사서 장착하세요 [1] [Q]',
      '🥷 봇 기지에서 브레인롯을 훔쳐보세요 [E]',
      '🔒 잠금 패드 위에서 [F]로 기지를 지세요',
      '♻️ 환생[R] 조건을 채워 성장하세요!',
    ];
    const show = () => {
      this.objectiveEl.textContent = steps[this.objectiveStep];
      this.objectiveEl.style.display = 'block';
    };
    const next = () => {
      this.objectiveStep++;
      if (this.objectiveStep < steps.length) show();
      else this.objectiveEl.style.display = 'none';
    };
    show();
    this.game.events.on('purchased', ({ buyerId }) => {
      if (buyerId === 'p0' && this.objectiveStep === 0) next();
    });
    // 방망이 구매 감지: tool-used가 더 간단 (장착/사용과 별개로 구매는 purchasedTools 변경) — 폴링
    const poll = window.setInterval(() => {
      if (this.objectiveStep === 1 && p.purchasedTools.includes('bat')) next();
      if (this.objectiveStep >= steps.length) window.clearInterval(poll);
    }, 500);
    this.game.events.on('steal-started', ({ thiefId }) => {
      if (thiefId === 'p0' && this.objectiveStep === 2) next();
    });
    this.game.events.on('locked', ({ ownerId }) => {
      if (ownerId === 'p0' && this.objectiveStep === 3) next();
    });
    this.game.events.on('rebirth-done', ({ playerId }) => {
      if (playerId === 'p0' && this.objectiveStep === 4) next();
    });
  }

  /** 운반 중인 브레인롯의 내 기지 도착 → 소유권 이전 (시뮬 틱에서 호출) */
  private tryPlayerTransfer(): void {
    const p0 = this.game.player('p0');
    if (!p0?.carrying) return;
    const ppos = this.game.state.positions.p0;
    if (!ppos || !inBaseZone(ppos, p0.baseId, 0)) return;
    const r = arriveOwnBase(this.game, 'p0');
    if (r.ok) this.onToast('✅ 훔친 브레인롯을 내 것으로 만들었다!');
    else if (r.reason === 'base-full' && this.game.state.timeMs - this.lastFullWarnAt > 3000) {
      this.lastFullWarnAt = this.game.state.timeMs;
      this.onToast('📦 기지 슬롯이 가득 찼어요! 환생(R)하거나 정리하세요');
    }
  }

  private updateBaseSigns(): void {
    for (const p of this.game.state.players) {
      const count = this.game.state.brainrots.filter(
        (i) => i.ownerId === p.id && i.location === 'base',
      ).length;
      const text = `${count}/${p.slots}`;
      if (this.lastSignText.get(p.baseId) === text) continue;
      this.lastSignText.set(p.baseId, text);
      this.map.setBaseInfo(p.baseId, count, p.slots);
    }
  }

  ownedCount(playerId: string): number {
    return this.game.state.brainrots.filter(
      (i) => i.ownerId === playerId && i.location === 'base',
    ).length;
  }

  gameTotalIncome(playerId: string): number {
    let sum = 0;
    for (const inst of this.game.state.brainrots) {
      if (inst.ownerId === playerId && inst.location === 'base' && inst.earning) {
        sum += instanceIncome(inst);
      }
    }
    return sum;
  }
}
