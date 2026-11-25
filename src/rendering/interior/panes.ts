import * as THREE from 'three';

/**
 * Where a bridge's windows are in the picture. The tactical overlay's labels are drawn over the whole picture; on a
 * bridge they belong in the windows, not on the walls, so the overlay is cut to these outlines.
 *
 * `panes` are the windows by their corners in the seat's frame (the eye at the origin, the bow at −z); `head` is
 * the head's turn. Returns one outline for each window that is in the picture, as x, y pairs in pixels.
 */
const NEAR = 0.05;
const inverse = new THREE.Quaternion();
const p = new THREE.Vector3();

export function paneOutlines(panes: readonly (readonly THREE.Vector3[])[], head: THREE.Quaternion, fov: number, aspect: number, width: number, height: number): number[][] {
  inverse.copy(head).invert();
  const ty = Math.tan(THREE.MathUtils.degToRad(fov) / 2), tx = ty * aspect, outlines: number[][] = [];
  for (const pane of panes) {
    // Into the head's own frame, then cut away what is behind the eye.
    const pts = pane.map((corner) => { p.copy(corner).applyQuaternion(inverse); return [p.x, p.y, p.z] as const; });
    const kept: (readonly [number, number, number])[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ain = a[2] < -NEAR, bin = b[2] < -NEAR;
      if (ain) kept.push(a);
      if (ain !== bin) { const t = (-NEAR - a[2]) / (b[2] - a[2]); kept.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, -NEAR]); }
    }
    if (kept.length < 3) continue;
    const outline: number[] = [];
    let inside = false;
    for (const [x, y, z] of kept) {
      const sx = (x / -z / tx) * 0.5 + 0.5, sy = 0.5 - (y / -z / ty) * 0.5;
      if (sx > 0 && sx < 1 && sy > 0 && sy < 1) inside = true;
      // A corner far outside the picture is held to a wide margin: a path is no better for a number in the millions.
      outline.push(Math.round(THREE.MathUtils.clamp(sx, -4, 5) * width * 10) / 10, Math.round(THREE.MathUtils.clamp(sy, -4, 5) * height * 10) / 10);
    }
    // A window with no corner in the picture may still cross it (the eye close to a wide pane): keep it unless it is wholly to one side.
    const xs = outline.filter((_, i) => i % 2 === 0), ys = outline.filter((_, i) => i % 2 === 1);
    const off = Math.max(...xs) < 0 || Math.min(...xs) > width || Math.max(...ys) < 0 || Math.min(...ys) > height;
    if (inside || !off) outlines.push(outline);
  }
  return outlines;
}

/** The outlines as the value of a CSS `clip-path`. With no window in the picture nothing is shown. */
export function clipPathOf(outlines: readonly (readonly number[])[]): string {
  if (!outlines.length) return 'polygon(0 0, 0 0, 0 0)';
  return `path("${outlines.map((o) => { let d = ''; for (let i = 0; i < o.length; i += 2) d += `${i ? 'L' : 'M'}${o[i]} ${o[i + 1]}`; return `${d}Z`; }).join('')}")`;
}
