#!/usr/bin/env python3
"""Dev harness: capture screenshots of the built app with headless Chromium.

Usage:  python3 shoot.py [--2d]
Writes screenshots/console.png (3D) and screenshots/console-2d.png (fallback map).
"""
import os
import shutil
import subprocess
import sys

CANDIDATES = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "/usr/bin/chromium"]
ROOT = os.path.dirname(os.path.abspath(__file__))


def find_chromium():
    for c in CANDIDATES:
        p = shutil.which(c)
        if p:
            return p
    return None


def shoot(exe, out, extra):
    url = "file://" + os.path.join(ROOT, "index.html")
    cmd = [
        exe, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
        "--window-size=1600,900", "--hide-scrollbars",
        "--virtual-time-budget=15000",
        "--screenshot=" + out,
    ] + extra + [url]
    subprocess.run(cmd, capture_output=True, timeout=120)
    print(("wrote " if os.path.exists(out) else "FAILED ") + out,
          os.path.getsize(out) if os.path.exists(out) else "")


def main():
    exe = find_chromium()
    if not exe:
        print("no chromium binary found; tried", CANDIDATES)
        return 2
    os.makedirs(os.path.join(ROOT, "screenshots"), exist_ok=True)
    shoot(exe, os.path.join(ROOT, "screenshots", "console.png"), [])
    if "--2d" in sys.argv:
        shoot(exe, os.path.join(ROOT, "screenshots", "console-2d.png"), ["--disable-gpu", "--disable-webgl"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
