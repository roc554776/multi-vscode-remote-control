#!/usr/bin/env python3
"""Build, package, and force-install the VSCode extension for development."""

# =============================================================================
# Coding Guidelines:
# - Python 3.9 syntax only (no match/case, no `X | Y` union syntax)
# - Minimize external dependencies; use stdlib when possible
# - Small library features: embed source directly (self-contained)
# - If external deps needed: use PEP 723 + `uv run`
# =============================================================================

import subprocess
import sys
import time
from pathlib import Path
from typing import List


CODE_CLI = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
EXT_DIR = REPO_ROOT / "packages" / "vscode-extension"


def run_command(cmd: List[str], cwd: Path = None) -> subprocess.CompletedProcess:
    """Run command, print outputs, and abort on failure."""
    print(">>> {0}".format(" ".join(cmd)))
    result = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
    )
    if result.stdout:
        print(result.stdout.strip())
    if result.stderr:
        print(result.stderr.strip(), file=sys.stderr)
    if result.returncode != 0:
        print("ERROR: command failed with exit code {0}".format(result.returncode), file=sys.stderr)
        sys.exit(result.returncode)
    return result


def get_vscode_pids() -> List[str]:
    """Get running VSCode main process PIDs."""
    result = subprocess.run(["pgrep", "-x", "Code"], capture_output=True, text=True)
    if result.returncode != 0:
        return []
    return [pid.strip() for pid in result.stdout.splitlines() if pid.strip()]


def ensure_vscode_stopped() -> None:
    """Ensure VSCode is completely stopped. Abort if still alive."""
    print("\n=== Step 3: ensure VSCode stopped ===")
    pids = get_vscode_pids()
    if not pids:
        print("VSCode is already stopped")
        return

    print("Attempting graceful quit...")
    subprocess.run(
        ["osascript", "-e", 'tell application "Visual Studio Code" to quit'],
        capture_output=True,
        text=True,
    )
    time.sleep(3)

    pids = get_vscode_pids()
    if not pids:
        print("VSCode stopped gracefully")
        return

    print("Graceful quit failed, killing PIDs: {0}".format(", ".join(pids)))
    for pid in pids:
        subprocess.run(["kill", "-9", pid], capture_output=True, text=True)
    time.sleep(2)

    pids = get_vscode_pids()
    if pids:
        print("ERROR: VSCode is still running: {0}".format(", ".join(pids)), file=sys.stderr)
        print("Abort installation.", file=sys.stderr)
        sys.exit(1)

    print("VSCode force-killed")


def package_extension() -> Path:
    """Package extension and return created VSIX path."""
    print("\n=== Step 2: package extension ===")
    before = set(EXT_DIR.glob("*.vsix"))
    run_command(["npx", "@vscode/vsce", "package", "--no-dependencies"], cwd=EXT_DIR)
    after = set(EXT_DIR.glob("*.vsix"))

    created = list(after - before)
    if created:
        latest = max(created, key=lambda p: p.stat().st_mtime)
        print("Created VSIX: {0}".format(latest))
        return latest

    candidates = list(after)
    if not candidates:
        print("ERROR: no VSIX file found after packaging", file=sys.stderr)
        sys.exit(1)

    latest = max(candidates, key=lambda p: p.stat().st_mtime)
    print("Using latest VSIX: {0}".format(latest))
    return latest


def install_vsix(vsix_path: Path) -> None:
    """Install VSIX via VSCode CLI with --force."""
    print("\n=== Step 4: install extension ===")
    if not Path(CODE_CLI).exists():
        print("ERROR: VSCode CLI not found: {0}".format(CODE_CLI), file=sys.stderr)
        sys.exit(1)

    run_command([CODE_CLI, "--install-extension", str(vsix_path), "--force"])
    print("Install complete")


def main() -> int:
    if len(sys.argv) != 1:
        print("Usage: python3 scripts/dev-install.py")
        return 1

    if not EXT_DIR.exists():
        print("ERROR: extension directory not found: {0}".format(EXT_DIR), file=sys.stderr)
        return 1

    print("=== Step 1: build extension ===")
    run_command(["npm", "run", "build"], cwd=EXT_DIR)

    vsix_path = package_extension()
    ensure_vscode_stopped()
    install_vsix(vsix_path)

    print("\n✅ Done: build, package, stop VSCode, and install")
    return 0


if __name__ == "__main__":
    sys.exit(main())
