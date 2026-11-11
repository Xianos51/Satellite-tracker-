#!/usr/bin/env python3
"""Dev harness: load the built index.html in headless Chromium and dump app state as JSON.

Usage:  python3 probe.py [url-or-file] [--2d]
Prints {url, mode, badge, count, clock, sysbanner, errors[]} to stdout.
Exits non-zero when no Chromium binary is found.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

CANDIDATES = [
    "chromium", "chromium-browser", "google-chrome", "google-chrome-stable",
    "chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium",
]


def find_chromium():
    for c in CANDIDATES:
        p = shutil.which(c) if os.path.sep not in c else (c if os.path.exists(c) else None)
        if p:
            return p
    return None


def main():
    args = sys.argv[1:]
    target = next((a for a in args if not a.startswith("--")), None)
    if not target:
        target = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "index.html"))
    force_2d = "--2d" in args
    exe = find_chromium()
    if not exe:
        print(json.dumps({"error": "no chromium binary found", "tried": CANDIDATES}))
        return 2

    probe_js = r"""
(() => {
  const badge = document.getElementById('badge');
  const count = document.getElementById('count');
  const clock = document.getElementById('clock');
  const sys = document.getElementById('sysbanner');
  return {
    badge: badge ? badge.textContent : null,
    badgeClass: badge ? badge.className : null,
    count: count ? count.textContent : null,
    clock: clock ? clock.textContent : null,
    sysbanner: sys && !sys.hidden ? sys.textContent : null,
    webgl: !!(window.Scene3D && Scene3D.available())
  };
})()
"""
    with tempfile.TemporaryDirectory() as td:
        profile = os.path.join(td, "profile")
        cmd = [
            exe, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
            "--user-data-dir=" + profile,
            "--window-size=1600,900",
            "--virtual-time-budget=12000",
            "--enable-logging=stderr", "--v=0",
        ]
        if force_2d:
            cmd += ["--disable-gpu", "--disable-webgl"]
        cmd += ["--dump-dom", target]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        dom = proc.stdout
        # evaluate state by injecting a marker page is complex with --dump-dom; instead parse DOM text
        import re
        def grab(tag_id):
            m = re.search(r'id="%s"[^>]*>([^<]*)<' % tag_id, dom)
            return m.group(1).strip() if m else None
        sysm = re.search(r'id="sysbanner"[^>]*>([^<]*)<', dom)
        result = {
            "url": target,
            "forced2d": force_2d,
            "badge": grab("badge"),
            "count": grab("count"),
            "clock": grab("clock"),
            "sysbanner": sysm.group(1).strip() if sysm and sysm.group(1).strip() else None,
            "domBytes": len(dom),
            "consoleErrors": [l for l in proc.stderr.splitlines() if "Uncaught" in l or "ERROR" in l][:10],
        }
        print(json.dumps(result, indent=2))
        return 0


if __name__ == "__main__":
    sys.exit(main())
