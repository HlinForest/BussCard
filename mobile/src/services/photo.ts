/**
 * 照片处理：单张裁切的透视校正（与桌面版 warp_card 同数学：getPerspectiveTransform + 双线性 warp）。
 * warpQuadRGBA 为纯函数（单测覆盖）；像素搬运经 canvas getImageData，文件读写经 cardstore。
 * 逐框重识别走“包围盒裁切 + 旋转”，quad 透视只在整图/自动框场景使用并有失败回退。
 */

export interface RGBAImage {
  w: number;
  h: number;
  data: Uint8ClampedArray; // RGBA
}

function solveHomography(src: number[][], dst: number[][]): number[] {
  // 解 3x3 单应矩阵（8 自由度，DCT 风格高斯消元），与 OpenCV getPerspectiveTransform 同解
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return solveLinear(A, b); // [h11,h12,h13,h21,h22,h23,h31,h32], h33=1
}

function solveLinear(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    const tmp = M[col];
    M[col] = M[piv];
    M[piv] = tmp;
    const d = M[col][col] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / d;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / (M[i][i] || 1e-12));
}

function orderPoints(quad: number[][]): number[][] {
  const pts = quad.map((p) => [...p]);
  const sum = pts.map((p) => p[0] + p[1]);
  const diff = pts.map((p) => p[0] - p[1]);
  const tl = pts[sum.indexOf(Math.min(...sum))];
  const br = pts[sum.indexOf(Math.max(...sum))];
  const tr = pts[diff.indexOf(Math.max(...diff))];
  const bl = pts[diff.indexOf(Math.min(...diff))];
  return [tl, tr, br, bl];
}

/** quad 为检测框四点（像素坐标），输出校正后的 RGBA（宽固定 outW，高等比）。 */
export function warpQuadRGBA(src: RGBAImage, quad: number[][], outW: number): RGBAImage {
  const [tl, tr, br, bl] = orderPoints(quad);
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const w = Math.max(1, Math.round(Math.max(dist(tl, tr), dist(bl, br))));
  const h = Math.max(1, Math.round(Math.max(dist(tl, bl), dist(tr, br))));
  const outH = Math.max(1, Math.round((outW * h) / w));
  const H = solveHomography(
    [[0, 0], [outW - 1, 0], [outW - 1, outH - 1], [0, outH - 1]],
    [tl, tr, br, bl],
  );
  const [h11, h12, h13, h21, h22, h23, h31, h32] = H;
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = (h11 * x + h12 * y + h13) / (h31 * x + h32 * y + 1);
      const sy = (h21 * x + h22 * y + h23) / (h31 * x + h32 * y + 1);
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const fx = sx - x0, fy = sy - y0;
      for (let c = 0; c < 4; c++) {
        const at = (xx: number, yy: number) => {
          const cx = Math.min(src.w - 1, Math.max(0, xx));
          const cy = Math.min(src.h - 1, Math.max(0, yy));
          return src.data[(cy * src.w + cx) * 4 + c];
        };
        out[(y * outW + x) * 4 + c] =
          at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) +
          at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
      }
    }
  }
  return { w: outW, h: outH, data: out };
}

/** 包围盒裁切（逐框重识别用；失败回退整图，调用方负责）。 */
export function bboxCropRGBA(src: RGBAImage, x: number, y: number, w: number, h: number): RGBAImage {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const w0 = Math.max(1, Math.min(src.w - x0, Math.round(w)));
  const h0 = Math.max(1, Math.min(src.h - y0, Math.round(h)));
  const out = new Uint8ClampedArray(w0 * h0 * 4);
  for (let y = 0; y < h0; y++) {
    for (let x = 0; x < w0; x++) {
      for (let c = 0; c < 4; c++) out[(y * w0 + x) * 4 + c] = src.data[((y0 + y) * src.w + x0 + x) * 4 + c];
    }
  }
  return { w: w0, h: h0, data: out };
}
