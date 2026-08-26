import * as THREE from 'three';

// 바닥 텍스처 — 사용자 제공 참고: 밝은 바탕 + 얇은 어두운 사각 격자선.
// (둥근 스터드 방식 제거 — 원작 실화면은 거의 평면 격자)

const cache = new Map<string, THREE.CanvasTexture>();

export interface FloorTextureOptions {
  /** 격자선 두께 px (0 = 무늬 없는 순색) */
  linePx?: number;
  /** 선 명암 비율 (0~1, 클수록 진한 선). 기본 0.18 */
  lineDark?: number;
  /** 셀 안쪽 밝기 변화 (0~1). 기본 0.06 */
  cellShade?: number;
}

/**
 * @param baseHex 바닥색
 * @param cellPx 한 셀(1 유닛)의 픽셀 크기
 */
export function floorTexture(
  baseHex: string,
  cellPx = 64,
  opts: FloorTextureOptions = {},
): THREE.CanvasTexture {
  const { linePx = 3, lineDark = 0.18, cellShade = 0.06 } = opts;
  const key = `${baseHex}|${cellPx}|${linePx}|${lineDark}|${cellShade}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = cellPx;
  canvas.height = cellPx;
  const ctx = canvas.getContext('2d')!;

  // 셀 바탕 — 중앙을 살짝 밝게 (오목한 타일 느낌)
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, cellPx, cellPx);
  const grad = ctx.createLinearGradient(0, 0, cellPx, cellPx);
  grad.addColorStop(0, `rgba(255,255,255,${cellShade})`);
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, `rgba(0,0,0,${cellShade * 0.7})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cellPx, cellPx);

  // 어두운 얇은 격자선 (하단+우측 에지에 그려 타일링 시 격자 완성)
  if (linePx > 0) {
    const [r, g, b] = parseHex(baseHex);
    const line = `rgb(${Math.round(r * (1 - lineDark))},${Math.round(g * (1 - lineDark))},${Math.round(b * (1 - lineDark))})`;
    ctx.fillStyle = line;
    ctx.fillRect(0, cellPx - linePx, cellPx, linePx); // 하단
    ctx.fillRect(cellPx - linePx, 0, linePx, cellPx); // 우측
    // 선 위 하이라이트 — 살짝 볼록한 타일 경계
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, cellPx - linePx - 1, cellPx, 1);
    ctx.fillRect(cellPx - linePx - 1, 0, 1, cellPx);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** 반복 바닥 재질 — width×height 유닛에 1유닛=1셀 타일링 */
export function floorMaterial(
  baseHex: string,
  wUnits: number,
  hUnits: number,
  opts: FloorTextureOptions = {},
): THREE.MeshLambertMaterial {
  const tex = floorTexture(baseHex, 64, opts).clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, Math.round(wUnits)), Math.max(1, Math.round(hUnits)));
  return new THREE.MeshLambertMaterial({ map: tex });
}

/** 하위 호환 — 기존 studMaterial 호출부용 래퍼 (같은 격자 방식 적용) */
export function studMaterial(
  baseHex: string,
  _studHex: string,
  wUnits: number,
  hUnits: number,
): THREE.MeshLambertMaterial {
  void _studHex;
  return floorMaterial(baseHex, wUnits, hUnits);
}
