#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
dsh-vision 图像预处理：裁切 + 缩放到长边上限 + 统一转 PNG。

由 Host 半通过子进程调用（execFile 直传，不经过 shell）：
    python prepare_image.py <src> <dst> <maxSide> [crop]

crop 为空或省略时不做裁切；否则为 "x,y,width,height" 四个数字，
都不大于 1 时按比例解释，否则按像素解释。

stdout 输出一行 JSON：{"ok": true, "width": w, "height": h, "out": path}
失败：{"ok": false, "error": "..."}
"""
import json
import sys


def main():
    src = sys.argv[1]
    dst = sys.argv[2]
    max_side = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else 1568
    crop_arg = sys.argv[4] if len(sys.argv) > 4 else ""
    crop = [float(v) for v in crop_arg.split(",")] if crop_arg.strip() else None

    from PIL import Image, ImageOps

    img = Image.open(src)
    img = ImageOps.exif_transpose(img)  # 手机拍照方向校正
    w, h = img.size

    if crop:
        x, y, cw, ch = [float(v) for v in crop]
        if max(abs(x), abs(y), abs(cw), abs(ch)) <= 1.0:
            left, top = int(x * w), int(y * h)
            right, bottom = int((x + cw) * w), int((y + ch) * h)
        else:
            left, top, right, bottom = int(x), int(y), int(x + cw), int(y + ch)
        left, top = max(0, min(left, w - 1)), max(0, min(top, h - 1))
        right, bottom = max(left + 1, min(right, w)), max(top + 1, min(bottom, h))
        img = img.crop((left, top, right, bottom))
        w, h = img.size

    scale = min(1.0, max_side / float(max(w, h)))
    if scale < 1.0:
        img = img.resize(
            (max(1, int(w * scale)), max(1, int(h * scale))),
            getattr(Image, "LANCZOS", Image.Resampling.LANCZOS),
        )

    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    img.save(dst, "PNG", optimize=True)
    print(json.dumps({"ok": True, "width": img.size[0], "height": img.size[1], "out": dst}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - 子进程边界，任何异常都转成 JSON
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)
