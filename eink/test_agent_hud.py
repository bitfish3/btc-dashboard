#!/usr/bin/env python3
"""Small offline tests for the page-2 data contract and binary renderer."""

from __future__ import annotations

import json
import tempfile
import time
import unittest
from pathlib import Path

from PIL import Image

from claude_hud_statusline import build_snapshot, write_snapshot
from read_agent_usage import load_claude_usage, load_codex_usage
from render_agent_hud import render
from render_note4 import build_frame


class AgentHudTests(unittest.TestCase):
    def test_codex_rollout_native_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "sessions" / "2026" / "08" / "01" / "rollout.jsonl"
            path.parent.mkdir(parents=True)
            rows = [
                {"type": "turn_context", "payload": {"model": "gpt-5.6-sol"}},
                {
                    "type": "event_msg",
                    "payload": {
                        "info": {
                            "model_context_window": 243200,
                            "total_token_usage": {"input_tokens": 1000, "output_tokens": 80, "total_tokens": 1080},
                            "last_token_usage": {"input_tokens": 200, "output_tokens": 20, "total_tokens": 220},
                        },
                        "rate_limits": {"primary": {"used_percent": 4, "window_minutes": 10080, "resets_at": 2000000000}},
                    },
                },
            ]
            path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")
            usage = load_codex_usage(temp, now=time.time())
            self.assertEqual(usage["model"], "gpt-5.6-sol")
            self.assertEqual(usage["total_tokens"], 1080)
            self.assertEqual(usage["last_total_tokens"], 220)
            self.assertEqual(usage["quotas"][0]["used_percent"], 4)

    def test_claude_status_snapshot_is_preferred(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            snapshot_path = Path(temp) / "claude.json"
            snapshot = build_snapshot(
                {
                    "model": {"display_name": "claude-sonnet-4-6"},
                    "context_window": {"used_percentage": 31, "context_window_size": 200000, "total_input_tokens": 900, "total_output_tokens": 70},
                    "rate_limits": {"five_hour": {"used_percentage": 12}, "seven_day": {"used_percentage": 22}},
                },
                now=1000,
            )
            write_snapshot(snapshot, snapshot_path)
            usage = load_claude_usage(temp, snapshot=snapshot_path, now=time.time())
            self.assertEqual(usage["source"], "claude-statusline")
            self.assertEqual(usage["context_percent"], 31)
            self.assertEqual(usage["total_tokens"], 970)
            self.assertEqual([q["label"] for q in usage["quotas"]], ["5H", "7D"])

    def test_render_is_exact_native_black_white(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "hud.png"
            render(output, now=1785592000)
            image = Image.open(output).convert("L")
            self.assertEqual(image.size, (400, 300))
            self.assertEqual(set(image.getdata()), {0, 255})

    def test_page_one_keeps_pendulum_and_two_readouts(self) -> None:
        live = {
            "price": 63000,
            "ahr999": 0.33,
            "mvrv": 1.2,
            "z": 0.4,
            "bp": 39000,
            "puell": 0.8,
            "sopr": 1.0,
            "psip": 46,
            "fng": 25,
        }
        frame = build_frame(1200, 900, live, scale=3)
        self.assertEqual(frame.mode, "L")
        self.assertEqual(frame.getbbox(), (0, 0, 1200, 900))


if __name__ == "__main__":
    unittest.main()
