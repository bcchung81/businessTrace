#!/usr/bin/env python3
"""사이드카 파이썬 런타임 호환성 검증.

후보 파이썬 버전별로 사이드카 의존성 트리를 실제로 해결(resolve)하고,
선택한 버전에 대해서는 venv 설치 + import 까지 수행해 핀할 버전을 결정한다.

    python3 scripts/sidecar_env_check.py
    python3 scripts/sidecar_env_check.py --install 3.12
    python3 scripts/sidecar_env_check.py -r gpt-researcher -r dartlab

gpt-researcher 0.16.0 은 query_processing.py 에서 Any/List 를 import 하지
않는다. Python 3.14 는 PEP 649 로 애노테이션을 지연 평가해 이 버그가 드러나지
않지만 3.12/3.13 에서는 import 시점에 NameError 로 죽는다. 그래서 아래 기본
요구사항은 gpt-researcher 를 0.15.1 로 핀한다. 업스트림 수정 후 해제할 것.
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

CANDIDATES = ["3.12", "3.13", "3.14"]

REQUIREMENTS = [
    "fastapi",
    "uvicorn[standard]",
    "pydantic-settings",
    "httpx",
    "python-dotenv",
    "gpt-researcher==0.15.1",
    "dartlab",
]

IMPORT_CHECKS = ["fastapi", "uvicorn", "dartlab", "gpt_researcher"]

RESOLVE_TIMEOUT = 600
INSTALL_TIMEOUT = 1800


def run(cmd, timeout):
    started = time.monotonic()
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return proc, time.monotonic() - started


def first_error_line(stderr):
    for line in stderr.splitlines():
        stripped = line.strip()
        if stripped.startswith("×") or stripped.startswith("help:"):
            return stripped
    for line in reversed(stderr.splitlines()):
        if line.strip():
            return line.strip()
    return "(stderr 없음)"


def resolve(version, req_file, workdir):
    out_file = workdir / f"resolved-{version}.txt"
    proc, elapsed = run(
        [
            "uv",
            "pip",
            "compile",
            "--python-version",
            version,
            "--no-header",
            "--output-file",
            str(out_file),
            str(req_file),
        ],
        RESOLVE_TIMEOUT,
    )
    if proc.returncode != 0:
        return {
            "version": version,
            "ok": False,
            "elapsed": elapsed,
            "detail": first_error_line(proc.stderr),
        }
    pinned = [
        line
        for line in out_file.read_text().splitlines()
        if line.strip() and not line.startswith((" ", "#", "-"))
    ]
    return {
        "version": version,
        "ok": True,
        "elapsed": elapsed,
        "detail": f"{len(pinned)}개 패키지 해결",
        "lockfile": out_file,
    }


def install_and_import(version, req_file, workdir):
    venv = workdir / f"venv-{version}"
    proc, _ = run(["uv", "venv", "--python", version, str(venv)], RESOLVE_TIMEOUT)
    if proc.returncode != 0:
        return False, f"venv 생성 실패: {first_error_line(proc.stderr)}", 0.0

    python = venv / "bin" / "python"
    proc, elapsed = run(
        ["uv", "pip", "install", "--python", str(python), "-r", str(req_file)],
        INSTALL_TIMEOUT,
    )
    if proc.returncode != 0:
        return False, f"설치 실패: {first_error_line(proc.stderr)}", elapsed

    script = "; ".join(
        [
            "import " + ", ".join(IMPORT_CHECKS),
            "import platform",
            "print(platform.python_version())",
        ]
    )
    proc, _ = run([str(python), "-c", script], RESOLVE_TIMEOUT)
    if proc.returncode != 0:
        return False, f"import 실패: {first_error_line(proc.stderr)}", elapsed

    size = sum(f.stat().st_size for f in venv.rglob("*") if f.is_file())
    return (
        True,
        f"python {proc.stdout.strip()} · import {len(IMPORT_CHECKS)}개 성공 · venv {size / 1024 / 1024:.0f}MB",
        elapsed,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install", metavar="VERSION", help="해당 버전으로 실제 설치·import 검증")
    parser.add_argument("--keep", action="store_true", help="작업 디렉터리 보존")
    parser.add_argument(
        "-r",
        "--requirement",
        action="append",
        metavar="SPEC",
        help="기본 요구사항 대신 검사할 패키지 (반복 지정 가능)",
    )
    args = parser.parse_args()

    requirements = args.requirement or REQUIREMENTS

    if shutil.which("uv") is None:
        print("uv 가 필요하다: https://docs.astral.sh/uv/", file=sys.stderr)
        return 2

    workdir = Path(tempfile.mkdtemp(prefix="sidecar-env-"))
    req_file = workdir / "requirements.in"
    req_file.write_text("\n".join(requirements) + "\n")

    print(f"대상: {', '.join(requirements)}")
    print(f"작업 디렉터리: {workdir}\n")

    results = []
    for version in CANDIDATES:
        print(f"[resolve] python {version} ...", flush=True)
        result = resolve(version, req_file, workdir)
        mark = "PASS" if result["ok"] else "FAIL"
        print(f"  {mark} ({result['elapsed']:.1f}s) {result['detail']}\n")
        results.append(result)

    print("=" * 72)
    print(f"{'버전':<8}{'해결':<8}{'소요':<10}상세")
    print("-" * 72)
    for result in results:
        print(
            f"{result['version']:<8}{'PASS' if result['ok'] else 'FAIL':<8}"
            f"{result['elapsed']:.1f}s{'':<4}{result['detail']}"
        )
    print("=" * 72)

    passing = [r["version"] for r in results if r["ok"]]
    if not passing:
        print("\n해결 가능한 버전이 없다. 의존성 목록을 재검토할 것.")
        return 1
    print(f"\n해결 가능: {', '.join(passing)}")

    if args.install:
        if args.install not in passing:
            print(f"{args.install} 은 해결 단계를 통과하지 못했다.", file=sys.stderr)
            return 1
        print(f"\n[install] python {args.install} 실제 설치 검증 ...", flush=True)
        ok, detail, elapsed = install_and_import(args.install, req_file, workdir)
        print(f"  {'PASS' if ok else 'FAIL'} ({elapsed:.1f}s) {detail}")
        if not ok:
            return 1

    if not args.keep:
        shutil.rmtree(workdir, ignore_errors=True)
    else:
        print(f"\n보존됨: {workdir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
