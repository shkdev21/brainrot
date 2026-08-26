# 🧠 브레인롯 훔치기 3D (Steal a Brainrot — Web Clone)

로블록스 [Steal a Brainrot](https://namu.wiki/w/Steal%20a%20Brainrot)에서 영감을 받은 **브라우저 3D 타이쿤 게임**. Three.js + TypeScript로 제작. 외부 에셋 없이 모든 그래픽을 절차적으로 생성합니다.

![genre](https://img.shields.io/badge/genre-tycoon%2Fsimulation-blue) ![tech](https://img.shields.io/badge/Three.js-TypeScript-orange)

## 실행

```bash
npm install
npm run dev        # 개발 서버 (기본 5173 포트)
npm run build      # 프로덕션 빌드 (dist/)
npm test           # 코어 로직 87개 단위 테스트
```

## 게임 방법

중앙 **레드카펫**을 걸어오는 브레인롯을 사서 기지에 전시하면 **초당 수입**이 발생합니다. 다른 플레이어(봇)의 기지에 침입해 브레인롯을 **훔치고**, 내 기지를 **잠금**으로 지키고, **환생**으로 성장하세요.

| 입력 | 동작 |
|---|---|
| WASD / 방향키, Space, Shift | 이동 / 점프 / 걷기 |
| 마우스 드래그·휠 | 카메라 회전 / 줌 |
| **E** | 카펫 브레인롯 구매 · 타 기지 브레인롯 훔치기 |
| **F** | 기지 잠금 (잠금 패드 위, 20초 지속 / 45초 쿨타임) |
| **1~0** | 도구 사용 |
| **B** | 도구 상점 |
| **R** | 환생 패널 |
| **M** | (개발) $10B 충전 · **N** 음소거 |

### 핵심 규칙 (원작 차용)

- 브레인롯을 **들면 이동속도 감소 + 도구 사용 불가** — 도주 게임
- 훔친 브레인롯은 **내 기지까지 운반해야** 소유권 이전
- **기절당하면 들고 있던 브레인롯을 드롭** — 무주공해가 되고, 때리면 소멸
- 잠긴 기지(유리가 붉은색)는 침입 불가
- **변이**: 골드 1.25x / 다이아 1.5x / 무지개 10x, 경매 이벤트 변이(candy/lava/galaxy)
- **환생 5단계**: 재료 브레인롯 + 돈 → 슬롯 +4, 도구 해금, 2환생 2층 / 5환생 3층
- **경매**: 4분마다 갓/비밀급 등장, 30초 입찰전 (봇도 입찰 참가)

### 도구 (환생 해금)

방망이·함정(0) → 점프부츠(1) → 투명망토·디스코볼(2) → 메두사·웹슬링거(3) → 터렛·대쉬검(4) → 순간이동기(5)

## 아키텍처

```
src/
  core/    순수 게임 로직 (three.js 무의존, 20Hz 고정 스텝, 시드 RNG)
           GameState · Economy · Carry · BaseLock · ToolEffects · Rebirth · Bots · Auction · Save
  render/  Three.js 계층 — Scene · MapBuilder(스터드 텍스처 거리/기지) ·
           CharacterMesh(밈 생물 절차 생성) · PlayerController · GameViews(통합)
  ui/      HTML 오버레이 — HUD · Shop · RebirthPanel · AuctionPanel · Toasts
  data/    브레인롯 40종+ · 변이 · 도구 · 환생 (원작 스탯 차용, JSON 데이터)
  audio/   WebAudio 신스 효과음
```

- 코어는 DOM/렌더 의존 0 → 추후 WebSocket 멀티플레이 서버로 이식 가능
- 캐릭터/이름은 절차 생성(원작 저작권 회피), 경제 수치는 나무위키 조사 데이터 기반
- 저장: localStorage 자동 저장(10초), 새로고침해도 이어서 플레이

## 참고

- 원작 조사: [나무위키 - Steal a Brainrot](https://namu.wiki/w/Steal%20a%20Brainrot)
- 개발 문서: `docs/superpowers/specs/`, `docs/superpowers/plans/`
