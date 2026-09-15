"""一图多卡定位：OpenCV 轮廓找四边形 + 透视校正。先分开再逐张识别，减少串卡。"""
import cv2
import numpy as np
import os

# 名片标准比 85.6 x 53.98 ≈ 1.586，拍照有透视，放宽到 [1.2, 2.2]
RATIO_MIN, RATIO_MAX = 1.2, 2.2


def _order_points(pts):
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def warp_card(img, quad, out_w=900):
    """透视校正为正面矩形。quad 为 4x2 点集。"""
    rect = _order_points(np.array(quad, dtype="float32"))
    (tl, tr, br, bl) = rect
    w1 = np.linalg.norm(br - bl)
    w2 = np.linalg.norm(tr - tl)
    h1 = np.linalg.norm(tr - br)
    h2 = np.linalg.norm(tl - bl)
    w = max(1, int(max(w1, w2)))
    h = max(1, int(max(h1, h2)))
    out_h = max(1, int(out_w * h / max(w, 1)))
    dst = np.array([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]], dtype="float32")
    m = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(img, m, (out_w, out_h))


def detect_cards(image_path, max_cards=10, min_area_ratio=0.02):
    """返回 [{'x','y','w','h' (0-1000 相对坐标), 'quad':[[x,y]x4] (像素)}]。"""
    img = cv2.imread(image_path)
    if img is None:
        return []
    H, W = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 50, 150)
    edges = cv2.dilate(edges, np.ones((5, 5), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    img_area = H * W
    quads = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < img_area * min_area_ratio:
            continue
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) != 4 or not cv2.isContourConvex(approx):
            continue
        quad = approx.reshape(4, 2)
        rect = _order_points(quad.astype("float32"))
        (tl, tr, br, bl) = rect
        w = (np.linalg.norm(br - bl) + np.linalg.norm(tr - tl)) / 2
        h = (np.linalg.norm(tr - br) + np.linalg.norm(tl - bl)) / 2
        if h == 0:
            continue
        ratio = max(w, h) / max(min(w, h), 1)
        if not (RATIO_MIN <= ratio <= RATIO_MAX):
            continue
        x, y, bw, bh = cv2.boundingRect(approx)
        quads.append({"area": float(area), "quad": quad.tolist(), "rect": (x, y, bw, bh)})

    # 按面积降序 + NMS 去重叠框
    quads.sort(key=lambda q: -q["area"])
    kept = []
    for q in quads:
        x, y, bw, bh = q["rect"]
        overlap = False
        for k in kept:
            kx, ky, kbw, kbh = k["rect"]
            ix = max(0, min(x + bw, kx + kbw) - max(x, kx))
            iy = max(0, min(y + bh, ky + kbh) - max(y, ky))
            inter = ix * iy
            smaller = min(bw * bh, kbw * kbh)
            if smaller > 0 and inter / smaller > 0.4:
                overlap = True
                break
        if not overlap:
            kept.append(q)
        if len(kept) >= max_cards:
            break

    # 从左到右、从上到下排序，方便核对
    kept.sort(key=lambda q: (q["rect"][1] // (H // 3), q["rect"][0]))
    out = []
    for q in kept:
        x, y, bw, bh = q["rect"]
        out.append({
            "x": int(x / W * 1000), "y": int(y / H * 1000),
            "w": int(bw / W * 1000), "h": int(bh / H * 1000),
            "quad": q["quad"],
        })
    return out


def crop_box(image_path, box, dest_path, out_w=1000):
    """按相对坐标框裁切 + 透视校正（如有 quad 则用 quad）。"""
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(image_path)
    H, W = img.shape[:2]
    quad = box.get("quad")
    if quad:
        warped = warp_card(img, quad, out_w=out_w)
    else:
        x = int(box["x"] / 1000 * W)
        y = int(box["y"] / 1000 * H)
        w = int(box["w"] / 1000 * W)
        h = int(box["h"] / 1000 * H)
        x, y = max(0, x), max(0, y)
        w, h = min(w, W - x), min(h, H - y)
        warped = img[y:y + h, x:x + w]
    os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
    cv2.imwrite(dest_path, warped)
    return dest_path
