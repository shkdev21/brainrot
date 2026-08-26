import * as THREE from 'three';

// 로블록스풍 스터드(돌기) 텍스처 — 캔버스로 생성해 재사용.

const cache = new Map<string, THREE.CanvasTexture>();

/**
 * @param baseHex 바닥색
 * @param studHex 돌기 하이라이트색
 * @param studsPerTile 한 타일(1 유닛)당 스터드 개수 (기본 1)
 */
export function studTexture(baseHex: string, studHex: string, cellPx = 64): THREE.CanvasTexture {
  const key = `${baseHex}|${studHex}|${cellPx}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = cellPx;
  canvas.height = cellPx;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, cellPx, cellPx);

  // 은은한 셀 그라데이션 (타일 경계 느낌)
  const grad = ctx.createLinearGradient(0, 0, 0, cellPx);
  grad.addColorStop(0, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.07)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cellPx, cellPx);

  // 스터드 원 — 상단 하이라이트/하단 그림자로 볼록감
  const cx = cellPx / 2;
  const cy = cellPx / 2;
  const r = cellPx * 0.28;
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.08, r, 0, Math.PI * 2);
  ctx.fillStyle = studHex;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.08, r * 0.82, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - r * 0.25, cy - r * 0.22, r * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter; // 픽셀 스터드 유지
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** 반복 스터드 재질 — width×height 유닛 크기에 맞춰 타일링 */
export function studMaterial(
  baseHex: string,
  studHex: string,
  wUnits: number,
  hUnits: number,
): THREE.MeshLambertMaterial {
  const tex = studTexture(baseHex, studHex).clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, Math.round(wUnits)), Math.max(1, Math.round(hUnits)));
  return new THREE.MeshLambertMaterial({ map: tex });
}
