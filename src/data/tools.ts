import type { ToolDef } from '../core/types';

// 도구 10종 — 원작 도구를 5단계 환생 체계에 재배치.
// unlockRebirth는 우리 게임의 0~5 환생 체계 기준.

export const TOOLS: ToolDef[] = [
  {
    id: 'bat', name: '방망이', unlockRebirth: 0, price: 500, kind: 'melee',
    cooldownMs: 2000, powerMs: 1500, range: 3.5,
    desc: '앞을 휘둘러 맞은 대상을 밀쳐내고 잠깐 기절시킨다',
  },
  {
    id: 'trap', name: '함정', unlockRebirth: 0, price: 1000, kind: 'trap',
    cooldownMs: 10000, powerMs: 7000, range: 1.2,
    desc: '바닥에 설치. 밟으면 7초간 움직일 수 없다 (최대 5개)',
  },
  {
    id: 'boots', name: '점프 부츠', unlockRebirth: 1, price: 2500, kind: 'passive',
    cooldownMs: 0, powerMs: 0, range: 0,
    desc: '장착만으로 점프력이 크게 상승한다',
  },
  {
    id: 'cloak', name: '투명 망토', unlockRebirth: 2, price: 10000, kind: 'cloak',
    cooldownMs: 15000, powerMs: 8000, range: 0,
    desc: '8초간 투명해지고 이동속도가 빨라진다. 봇이 당신을 보지 못한다',
  },
  {
    id: 'disco', name: '디스코볼', unlockRebirth: 2, price: 15000, kind: 'aoeStun',
    cooldownMs: 10000, powerMs: 2500, range: 8,
    desc: '주변 8m의 다른 플레이어를 강제로 춤추게 해 기절시키고, 운반 중인 브레인롯을 떨어뜨린다',
  },
  {
    id: 'medusa', name: '메두사의 머리', unlockRebirth: 3, price: 50000, kind: 'aoeStun',
    cooldownMs: 25000, powerMs: 6000, range: 10,
    desc: '주변 10m의 모든 대상을 돌로 만들어 6초간 기절시킨다',
  },
  {
    id: 'web', name: '웹 슬링거', unlockRebirth: 3, price: 75000, kind: 'pull',
    cooldownMs: 20000, powerMs: 3000, range: 14,
    desc: '대상을 자신 앞으로 끌어와 3초간 기절시킨다',
  },
  {
    id: 'turret', name: '터렛', unlockRebirth: 4, price: 150000, kind: 'turret',
    cooldownMs: 90000, powerMs: 60000, range: 12,
    desc: '60초간 주변 침입자에게 기절 레이저를 발사하는 포탑을 설치한다',
  },
  {
    id: 'sword', name: '대쉬 검', unlockRebirth: 4, price: 400000, kind: 'dash',
    cooldownMs: 8000, powerMs: 2000, range: 10,
    desc: '전방으로 돌진하며 베어낸다. 맞으면 멀리 날아가고 기절한다',
  },
  {
    id: 'blink', name: '순간이동기', unlockRebirth: 5, price: 1000000, kind: 'blink',
    cooldownMs: 5000, powerMs: 0, range: 8,
    desc: '바라보는 방향으로 8m 순간이동한다',
  },
];

export const TOOL_BY_ID: ReadonlyMap<string, ToolDef> = new Map(
  TOOLS.map((t) => [t.id, t]),
);
