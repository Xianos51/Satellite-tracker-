#!/usr/bin/env python3
"""Inline everything under src/ into a single self-contained index.html at the repo root.

The template src/index.html contains marker lines:
    /* @@INLINE:css/console.css@@ */     (inside <script> or <style>)
    <!-- @@INLINE:...@@ -->
Each marker line is replaced with the full content of the referenced file.
JS content has "</script" escaped so the bundle stays parseable.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
TEMPLATE = SRC / "index.html"
OUT = ROOT / "index.html"


def esc_js(text: str) -> str:
    return text.replace("</script", "<\\/script")


def esc_css(text: str) -> str:
    return text.replace("</style", "<\\/style")


def build() -> int:
    tpl = TEMPLATE.read_text(encoding="utf-8")
    out_lines = []
    inlined = []
    missing = []
    for line in tpl.splitlines(keepends=True):
        stripped = line.strip()
        if "@@INLINE:" in stripped and stripped.endswith("@@ */") or ("@@INLINE:" in stripped and "@@ -->" in stripped):
            path = stripped.split("@@INLINE:", 1)[1].split("@@", 1)[0].strip()
            f = SRC / path
            if not f.is_file():
                missing.append(path)
                out_lines.append(line)
                continue
            content = f.read_text(encoding="utf-8")
            if stripped.startswith("/*"):
                content = esc_js(content)
            elif stripped.startswith("<!--"):
                content = esc_css(content)
            out_lines.append(content if content.endswith("\n") else content + "\n")
            inlined.append((path, len(content)))
        else:
            out_lines.append(line)
    if missing:
        for m in missing:
            print(f"MISSING inline source: src/{m}", file=sys.stderr)
        return 1
    html = "".join(out_lines)
    if "@@INLINE:" in html:
        print("ERROR: unreplaced @@INLINE marker remains", file=sys.stderr)
        return 1
    OUT.write_text(html, encoding="utf-8")
    total = len(html.encode("utf-8"))
    print(f"built {OUT.relative_to(ROOT)}  ({total:,} bytes, {total/1e6:.2f} MB)")
    for path, size in inlined:
        print(f"  inlined src/{path}  ({size:,} bytes)")
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["--check"]:
        before = OUT.read_bytes() if OUT.exists() else None
        rc = build()
        after = OUT.read_bytes() if OUT.exists() else None
        if rc == 0 and before != after:
            print("STALE: index.html differs from a fresh build", file=sys.stderr)
            rc = 2
        sys.exit(rc)
    sys.exit(build())
