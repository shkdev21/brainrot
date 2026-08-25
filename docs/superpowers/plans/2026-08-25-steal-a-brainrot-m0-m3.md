# Steal a Brainrot 웹 3D 클론 — M0~M3 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저에서 동작하는 3D "브레인롯 훔치기" 게임 — 구매→수입→훔치기→방어→환생 나선을 AI 봇 7명과 함께 재현.

**Architecture:** 순수 TypeScript 게임 로직(`src/core/`, 20Hz 고정 타임스텝, 렌더링 무의존) + Three.js 렌더링 계층(`src/render/`) + HTML 오버레이 UI(`src/ui/`). 계층 간 통신은 이벤트 버스로 단방향 연결.

**Tech Stack:** TypeScript 5, Vite, three.js, Vitest. 외부 에셋 없음(절차적 메시 + WebAudio 효과음).

**Spec:** `docs/superpowers/specs/2026-08-25-steal-a-brainrot-web-3d-design.md`

## Global Constraints

- 원작 캐릭터 visuals/names 미사용 — 표시명은 시드 기반 절차적 생성(원작명은 data에 `source`로만 보존)
- 경제 수치는 원작 데이터 차용: Common $1/s~$13/s($25~$1.5K) … Mythic까지. `docs/research/brainrots_normal.json` 기반
- 변이 배율: Gold 1.25x / Diamond 1.5x / Rainbow 10x, 이벤트 변이(Candy 4x, Lava 6x, Galaxy 7x)
- 환생 5단계: (Rare 2종+500K) → (+1.5M, 2층) → (+7.5M) → (+25M) → (+100M, 3층). 단계별 슬롯 +4
- 훔치기 규칙: 들면 이속 55% 감소·도구 사용 불가, 내 기지 도착 시 소유권 이전, 기절 시 드롭
- 기지 잠금: 20초 지속, 45초 쿨타임, 잠금 중 타인 침입 불가
- `core/`는 DOM·three.js import 금지 (멀티 확장 대비). RNG는 주입형 시드 RNG 사용
- 클라이언트 단일 빌드(정적 호스팅), 저장은 localStorage

---

### Task 1: 프로젝트 스캐폴드

**Files:**
- Create: `package.json`, `tsconfig.json`, `index.html`, `src/main.ts`, `src/render/Scene.ts`(stub), `vitest.config.ts`

**Steps:**
- [ ] `npm create vite` 없이 수동 구성: package.json(vite, typescript, three, @types/three, vitest), tsconfig(strict, ES2022), index.html(#app + #ui 캔버스 구조)
- [ ] Scene stub: 캔버스 생성 + 기본 렌더 루프 → `npm run dev`로 파란 하늘 씬 확인
- [ ] `npm test` 스크립트(vitest) 동작 확인 (테스트 0개로 녹색)
- [ ] Commit: `chore: vite+three+vitest scaffold`

### Task 2: 코어 타입 + 시드 RNG + 데이터 파일

**Files:**
- Create: `src/core/types.ts`, `src/core/rng.ts`, `src/data/brainrots.ts`, `src/data/mutations.ts`, `src/data/tools.ts`, `src/data/rebirths.ts`
- Test: `tests/data.test.ts`

**Interfaces (Produces):**
- `type Rarity = 'common'|'rare'|'epic'|'legendary'|'mythic'|'god'|'secret'`
- `BrainrotDef { id, rarity, baseIncome, price, source }`, `MutationDef { id, mult, colorHex, weight }`, `ToolDef { id, name, unlockRebirth, cooldownMs, kind }`, `RebirthDef { level, requiredBrainrotIds, requiredMoney }`
- `brainrots: BrainrotDef[]`(36종+경매용 상위 4종), `MUTATIONS`, `TOOLS`(10종), `REBIRTHS`(5단계)
- `makeRng(seed:number): ()=>number` (mulberry32), `pick<T>(rng, arr)`, `rollMutation(rng, weights)`

**Key data:** 원작 스탯 그대로 (Common 6종: $1/$25~$13/$1.5K, Rare 7종: $15/$2K~$65/$9K, Epic 10종, Legendary 10종, Mythic 3종+$2.5K~$7.5K급, 경매용 god/secret 4종 $20M~$100M). 도구 10종 unlockRebirth: bat0/trap0/boots1/cloak2/disco2/medusa3/web3/turret4/sword4/blink5.

- [ ] 데이터 무결성 테스트: 등급별 가격/수입 단조 증가, 환생 재료 id 존재, 변이 배율 일치(1.25/1.5/10)
- [ ] RNG 테스트: 동일 시드 = 동일 시퀀스, rollMutation 확률 합 검증
- [ ] Commit: `feat(core): types, seeded RNG, game data`

### Task 3: GameState + Economy (수입·구매·스폰)

**Files:**
- Create: `src/core/GameState.ts`, `src/core/Economy.ts`, `src/core/events.ts`
- Test: `tests/economy.test.ts`

**Interfaces:**
- `class Game { state; tick(dtMs); buy(playerId, spawnId); on(type, fn) }`
- `GameState { timeMs; players: PlayerState[]; spawns: Spawn[]; bases: BaseState[] }`
- `PlayerState { id; name; isBot; money; rebirth; slots; baseId; carrying; stunUntil; slowUntil; invisUntil; unlockedTools; toolCooldowns }`
- `Spawn { id; defId; mutation?; onCarpet; buyerId?; walkingToBase? }` — 구매 시 브레인롯이 기지 슬롯으로 이동(2초 워크), 도착 후 수입 개시
- 수입 공식: `Σ baseIncome×mutationMult`, 1초 배치 적립. `formatMoney(n)` — "1.5K/M/B/T/Qa" 포맷터
- 스폰 스케줄러: common 12~25s, rare 30~60s, epic 90~150s, legendary 300s 확정, mythic은 경매 전용

- [ ] 테스트: 5초 틱 후 수입 = Σ(income×mult)×5 / 잔액 부족 구매 거부 / 슬롯 만석 거부 / 스폰 등급별 타이밍(시드 고정)
- [ ] Commit: `feat(core): game state, economy, spawn scheduler`

### Task 4: 운반·소유권 (훔치기 코어)

**Files:**
- Create: `src/core/Carry.ts`
- Test: `tests/carry.test.ts`

**Interfaces:**
- `tryPickUp(g, playerId, spawnOrSlotId)`: 내 기지 아닌 경우에만 '훔치기', 잠긴 기지는 침입 단계에서 차단(위치 판정은 render 계측→core 전달)
- `updateCarry(g, dt)`: 운반자 이속 55%(`slowUntil` 갱신), 운반 중 도구 사용 불가 플래그
- `arriveOwnBase(g, playerId)`: 운반 브레인롯 소유권 이전+슬롯 배정
- `dropCarried(g, playerId)`: 기절/게임 종료 시 제자리 드롭(무주공해 spawn化)
- 봇/플레이어 공통 규칙, 소유권 이전은 이벤트 `ownership-transferred` 발행

- [ ] 테스트: 타 기지 픽업→내 기지 도착→소유권/수입 반영 / 기절 시 드롭 / 풀슬롯 상태 이전 거부
- [ ] Commit: `feat(core): carry & ownership rules`

### Task 5: 기지 잠금 + 상태효과 + 도구 효과

**Files:**
- Create: `src/core/BaseLock.ts`, `src/core/ToolEffects.ts`
- Test: `tests/tools.test.ts`

**Interfaces:**
- `BaseState { id; ownerId; lockedUntil; lockCooldownUntil; floors; slots: (string|null)[] }`
- `lockBase(g, playerId)`: 20s 지속/45s 쿨타임. 잠금 중 비친구 입장 차단(침입 판정 진입점 `canEnterBase`)
- `applyStun(g, targetId, ms)` `applyKnockback(g, targetId, dir, force)`(위치는 render가 소비할 벡터 이벤트)
- `useTool(g, playerId, toolId, ctx)`: ctx = {aimDir, position, targetId?}. 도구별: bat(근접 기절1.5s+넉백), trap(설치 max5, 밟으면 7s 루트), boots(패시브 점프), cloak(8s 은신+이속), disco(반경 8m 기절 2.5s+강제 드롭), medusa(반경 10m 기절 6s), web(대상 끌어오기+3s 기절), turret(설치 60s, 반경 12s마다 기절 레이저), sword(돌진+넉백 기절 2s), blink(전방 8m 텔레포트)
- 운반 중 도구 사용 불가, 기절 중 이동·픽업·도구 전부 불가

- [ ] 테스트: 잠금 중 침입 차단/해제 후 가능 / 각 도구 쿨타임·기절 지속시간 / trap 밟기 루트 / turret 설치 수 제한
- [ ] Commit: `feat(core): base lock, status effects, 10 tools`

### Task 6: 환생 시스템

**Files:**
- Create: `src/core/Rebirth.ts`
- Test: `tests/rebirth.test.ts`

**Interfaces:**
- `canRebirth(g, playerId): {ok, missing[]}` — 필요 브레인롯 보유(기지 슬롯 내) + 돈
- `doRebirth(g, playerId)`: 브레인롯·돈 초기화, rebirth+1, 슬롯+4, 도구 해금(rebirth에 따라), 2환생 2층/5환생 3층 해금 플래그
- 환생 UI용 이벤트 `rebirth-done`

- [ ] 테스트: 재료 부족 시 거부 / 환생 후 상태 초기화·해금 확인 / 층 해금 시점
- [ ] Commit: `feat(core): rebirth system`

### Task 7: 봇 AI

**Files:**
- Create: `src/core/Bots.ts`
- Test: `tests/bots.test.ts`

**Interfaces:**
- `class BotBrain { constructor(playerId, persona: 'raider'|'guardian'|'farmer', skill: 0..1) ; update(g, dt): BotIntent }`
- `BotIntent = {moveTo: Vec2|nil, buySpawnId?, lockBase?: bool, useTool?: {toolId, ctx}, pickUp?: id}`
- 봇 틱(2Hz): farmer=스폰 구매 우선, raider=부유 기지 타겟→침입→픽업→귀환(스킬 따라 잠금 체크/도구 회피), guardian=자기 기지 순찰+침입자 기절 도구
- 훔치기 대상 선택: 수입 상위 기지 + 거리 가중치. 훔친 뒤 내 기지 잠금 즉시 사용

- [ ] 테스트(시드 고정): farmer가 살 수 있는 스폰出现 시 구매 의도 / raider가 잠긴 기지 회피 / guardian이 침입자에게 도구 사용
- [ ] Commit: `feat(core): bot AI personas`

### Task 8: 3D 씬 + 맵 (M0 비주얼)

**Files:**
- Create: `src/render/MapBuilder.ts`, `src/render/Scene.ts`(본체), `src/render/mathUtils.ts`
- Modify: `src/main.ts`

**Interfaces:**
- `buildMap(scene, bases:number): MapRefs { carpetZone: Box3; baseZones: {id, door, lockPad, floors}[] }` — 원형 섬(반경 70), 중앙 레드카펫 스트립, 8개 기지 링(반경 42, 45° 간격), 기지는 1층 몸체+해금 시 2/3층 플랫폼+램프, 현관문+잠금 패드 메시
- 씬: 하늘색 배경, hemisphere+directional light, 그림자 옵션, 낮은 폴리 지면(원형), 장식 나무/가로등 인스턴싱
- 간단 충돌: 원형 섬 경계 + 기지 벽 AABB 목록을 `colliders`로 노출 (Task 9가 소비)

- [ ] `npm run dev`: 섬+카펫+8기지 렌더 확인, 60fps
- [ ] Commit: `feat(render): island map with 8 bases and red carpet`

### Task 9: 캐릭터 메시 + 플레이어 조작

**Files:**
- Create: `src/render/CharacterMesh.ts`, `src/render/PlayerController.ts`, `src/render/Effects.ts`

**Interfaces:**
- `buildBrainrotMesh(def, mutation, rng): Group` — 절차적: 바디(박스/캡슐 조합)×머리 형태 5종×부속(시계/날개/바퀴/뿔)×등급별 스케일(1.0~2.2)×변이 색(material color / 무지개 HSL 애님 플래그)
- `buildAvatar(color): Group` — 로우폴리 휴머노이드(플레이어/봇 공용, 색으로 구분)
- `PlayerController { update(dt, input, playerState) }` — 3인칭 카메라(마우스 드래그 궤도/휠 줌), WASD+Space 점프+Shift 걷기, 충돌(Task 8 colliders), 이속 페널티 반영, 기절 시 입력 차단, 은신 반투명 처리
- `Effects`: 돈 파티클(+$ 스프라이트 상승), 기절 별, 텔레포트 플래시, 넉백 벡터 적용(코어 이벤트 소비)

- [ ] 브라우저: WASD 이동/점프/카메라, 기지 벽 충돌, 운반 시 이속 체감
- [ ] Commit: `feat(render): procedural characters and player controller`

### Task 10: 게임 통합 (스폰/구매/운반/봇 렌더 바인딩)

**Files:**
- Create: `src/render/GameViews.ts`, `src/render/BotViews.ts`
- Modify: `src/main.ts`

**Interfaces:**
- 메인 루프: 20Hz core tick + rAF 렌더 보간. 브레인롯 스폰→카펫 등장(부유+등급 라벨), 구매→기지 슬롯 걷기 애님, 운반→어깨 위 표시, 봇 intent→이동/행동 재생
- 구매 상호작용: 카펫 브레인롯 근접+클릭(또는 E)→core.buy. 훔치기: 타 기지 슬롯 근접+E→tryPickUp, 내 기지 도착 자동 이전. 기지 잠금: 패드 밟고 F(쿨타임 UI). 도구: 1~0 키 or 클릭 UI
- 침입 판정: render가 "플레이어가 기지 문 통과"를 감지→`canEnterBase` 질의→차단 시 밀어내기+경고

- [ ] 브라우저: 구매→걷기→수입 파티클→봇 기지 침입→훔치기→귀환 이전까지 풀 사이클
- [ ] Commit: `feat: full core loop playable (buy/income/steal/return)`

### Task 11: UI 오버레이 (HUD·상점·환생·토스트)

**Files:**
- Create: `src/ui/HUD.ts`, `src/ui/Shop.ts`, `src/ui/RebirthPanel.ts`, `src/ui/Toasts.ts`, `src/ui/style.css`

**Interfaces:**
- HUD: 좌상단 돈/초당 수입/환생 레벨, 중앙하단 도구 슬롯(쿨다운 원형 게이지), 운반 중 배너, 기지 잠금 상태 버튼(F), 미니 안내(목표 힌트)
- Shop: B키 — 도구 목록(가격=level×$2.5K 계열, 해금 조건 표시), 구매 확정
- RebirthPanel: R키 — 조건 체크리스트(재료 브레인롯 보유 현황/돈), 실행 버튼+확인 모달
- Toasts: 구매/피습/훔침 성공/환생/경매 알림. 모든 UI는 core 이벤트 구독만으로 갱신(직접 참조 금지)

- [ ] 브라우저: 상점 구매→슬롯 장착→사용 쿨타임, 환생 조건 달성→실행→도구 해금 확인
- [ ] Commit: `feat(ui): HUD, tool shop, rebirth panel, toasts`

### Task 12: 경매 이벤트 + 변이 이벤트

**Files:**
- Create: `src/core/Auction.ts`, `src/ui/AuctionPanel.ts`
- Test: `tests/auction.test.ts`

**Interfaces:**
- 4분마다 god/secret급 1종 경매 개최(30s 입찰, 시작가 def.price의 40%), 봇 스킬별 상한 입찰, 최고가 낙찰→기지 슬롯 직행. 이벤트 변이: 경매 물품에 50% 확률로 candy/lava/galaxy 부여
- 입찰 UI: 남은 시간, 현재 최고가, +10% 입찰 버튼

- [ ] 테스트: 최고가 낙찰/봇 상한/미입찰 시 스폰 복귀
- [ ] Commit: `feat: timed auction with event mutations`

### Task 13: 저장/불러오기 + 밸런스 + 사운드 + 마무리

**Files:**
- Create: `src/core/Save.ts`, `src/audio/Sfx.ts`
- Modify: `src/main.ts`, `src/data/brainrots.ts`(튜닝)

**Interfaces:**
- Save: GameState 직렬화(localStorage, 10초+unload), 버전 필드, 봇 포함. `resetSave()` 디버그 버튼
- Sfx: WebAudio 신스(구매=상승 아르페지오, 수입 틱, 기절=노이즈, 훔침 성공=팡파레, 경마 벨). 음소거 토글
- 밸런스: 30분 세션 기준 환생 2~3회 도달하도록 스폰 간격/봇 난이도 조정. 시작 자금 $100

- [ ] 브라우저: 새로고침 후 이어하기, 리셋 동작, 효과음
- [ ] 최종 점검: 콘솔 무에러, 30분 플레이스루, README 작성
- [ ] Commit: `feat: save/load, sfx, balance pass` → `npm run build` 성공

## Self-Review 결과

- 스펙 커버: 구매/수입/훔치기/잠금/변이/환생/도구 10종/봇/옥션/저장 — 각 Task 3,4,5,6,7,10,11,12,13에 대응. 특성 시스템·퓨즈·듀얼은 Phase 2 제외(스펙 §2.1 명시)
- 타입 일관성: PlayerState/Spawn/BaseState 필드명 Task 3→13 동일 유지, `canEnterBase`·`ownership-transferred` 인터페이스 Task 5/4에서 정의 후 Task 10이 소비
- 그래픽 카드 무관하게 로우폴리 유지(성능 리스크 §6 대응)
