import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { warpQuadRGBA, bboxCropRGBA, type RGBAImage } from '../src/services/photo.js';

function gradient(w: number, h: number): RGBAImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = Math.round((x / (w - 1)) * 255);
      data[i + 1] = Math.round((y / (h - 1)) * 255);
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  return { w, h, data };
}

describe('photo warp', () => {
  it('恒等 quad 近似还原（双线性误差容限内）', () => {
    const src = gradient(60, 40);
    const out = warpQuadRGBA(src, [[0, 0], [59, 0], [59, 39], [0, 39]], 60);
    assert.equal(out.w, 60);
    assert.equal(out.h, 40);
    let err = 0;
    for (let i = 0; i < out.data.length; i += 4) err += Math.abs(out.data[i] - src.data[i]);
    assert.ok(err / (60 * 40) < 2, `mean err ${err / 2400}`);
  });

  it('透视 quad 输出等比尺寸', () => {
    const src = gradient(100, 100);
    const out = warpQuadRGBA(src, [[10, 5], [90, 15], [85, 95], [5, 85]], 90);
    assert.equal(out.w, 90);
    assert.ok(out.h >= 80 && out.h <= 100);
  });

  it('包围盒裁切越界钳制', () => {
    const src = gradient(50, 50);
    const out = bboxCropRGBA(src, -10, -10, 100, 100);
    assert.deepEqual([out.w, out.h], [50, 50]);
    // 左上像素应为原图 (0,0)
    assert.equal(out.data[0], 0);
    assert.equal(out.data[1], 0);
  });
});
