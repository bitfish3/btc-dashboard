#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render and push the fuckbtc cycle card to a ZECTRIX NOTE4."""

from __future__ import annotations

import argparse
import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from render_note4 import render


API_BASE = "https://cloud.zectrix.com/open/v1"
DEFAULT_PAGE_ID = "1"


def _request_json(method: str, url: str, api_key: str, body: bytes | None = None) -> dict:
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("X-API-Key", api_key)
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # Never include request headers in the error.  They contain the API key.
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"ZECTRIX API HTTP {exc.code}: {detail}") from exc


def resolve_device_id(api_key: str, requested: str | None) -> str:
    if requested:
        return requested.strip()
    payload = _request_json("GET", f"{API_BASE}/devices", api_key)
    devices = payload.get("data") or []
    if len(devices) != 1:
        names = [str(d.get("alias") or d.get("deviceId") or "?") for d in devices]
        raise RuntimeError("未指定设备 ID；当前 API 返回设备数为 " + str(len(devices)) + "（" + ", ".join(names) + "）")
    device_id = str(devices[0].get("deviceId") or "").strip()
    if not device_id:
        raise RuntimeError("设备列表缺少 deviceId")
    print(f"[note4-eink] auto-selected device: {devices[0].get('alias') or device_id}")
    return device_id


def _multipart_image(image_path: Path, page_id: str) -> tuple[bytes, str]:
    boundary = "----zectrix-note4-" + secrets.token_hex(12)
    image = image_path.read_bytes()
    filename = image_path.name
    chunks = [
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="images"; filename="' + filename.encode() + b'"\r\n',
        b"Content-Type: image/png\r\n\r\n",
        image,
        b"\r\n",
        f"--{boundary}\r\n".encode(),
        # NOTE4 is a 1-bit panel, but the cloud's dither=true path preserves
        # perceived grayscale from the 16-level source image.
        b'Content-Disposition: form-data; name="dither"\r\n\r\ntrue\r\n',
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="pageId"\r\n\r\n' + page_id.encode() + b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def push_image(api_key: str, device_id: str, image_path: Path, page_id: str) -> dict:
    body, content_type = _multipart_image(image_path, page_id)
    encoded_id = urllib.parse.quote(device_id, safe="")
    req = urllib.request.Request(
        f"{API_BASE}/devices/{encoded_id}/display/image",
        data=body,
        method="POST",
    )
    req.add_header("X-API-Key", api_key)
    req.add_header("Accept", "application/json")
    req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"ZECTRIX image push HTTP {exc.code}: {detail}") from exc
    if payload.get("code") not in (None, 0):
        raise RuntimeError(f"ZECTRIX image push failed: code={payload.get('code')} msg={payload.get('msg', '')}")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device-id", default=os.environ.get("ZECTRIX_DEVICE_ID"), help="NOTE4 MAC/deviceId")
    parser.add_argument("--page-id", default=DEFAULT_PAGE_ID)
    parser.add_argument("--out", default=str(Path(__file__).with_name("note4_cycle.png")))
    parser.add_argument("--dry-run", action="store_true", help="render only; do not call ZECTRIX")
    args = parser.parse_args()

    price, ahr999 = render(args.out)
    if args.dry_run:
        print(f"[note4-eink] dry-run complete: price=${price:,.0f} ahr999={ahr999}")
        return

    api_key = os.environ.get("ZECTRIX_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("缺少 ZECTRIX_API_KEY；请通过 Avibe Vault 注入，不要写入脚本或 plist")
    device_id = resolve_device_id(api_key, args.device_id)
    payload = push_image(api_key, device_id, Path(args.out), args.page_id)
    data = payload.get("data") or {}
    print(
        f"[note4-eink] pushed page={data.get('pageId', args.page_id)} "
        f"pages={data.get('pushedPages', '?')} price=${price:,.0f} ahr999={ahr999}"
    )


if __name__ == "__main__":
    main()
