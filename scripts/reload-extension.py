#!/usr/bin/env python3
"""
VSCode 拡張機能のリロードスクリプト。
ビルド → パッケージング → VSCode強制起動 → アンインストール → VSCode停止 → VSCode再起動 → インストール → 検証 の一連の手続きを自動化。
"""

import subprocess
import time
import sys
import os
from pathlib import Path

# Paths
EXTENSION_DIR = Path(__file__).parent.parent / "packages" / "vscode-extension"
VSIX_PATH = EXTENSION_DIR / "multi-vscode-remote-control-0.1.0.vsix"
CODE_CLI = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
EXTENSION_ID = "roc.multi-vscode"
WORKSPACE_PATH = Path(__file__).parent.parent


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    """Run a command and return the result."""
    print(f">>> {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout.strip())
    if result.stderr:
        print(result.stderr.strip(), file=sys.stderr)
    if check and result.returncode != 0:
        print(f"Command failed with exit code {result.returncode}")
        sys.exit(1)
    return result


def build_extension() -> None:
    """Build the extension."""
    print("\n=== Building extension ===")
    os.chdir(EXTENSION_DIR)
    run(["npm", "run", "build"])


def package_extension() -> None:
    """Package the extension as VSIX."""
    print("\n=== Packaging extension ===")
    os.chdir(EXTENSION_DIR)
    # Remove old vsix
    if VSIX_PATH.exists():
        VSIX_PATH.unlink()
    run(["npx", "vsce", "package", "--allow-missing-repository", "--allow-star-activation"])


def uninstall_extension() -> None:
    """Uninstall the extension."""
    print("\n=== Uninstalling extension ===")
    result = run([CODE_CLI, "--uninstall-extension", EXTENSION_ID], check=False)
    if "not installed" in result.stderr.lower():
        print("Extension not installed, skipping uninstall")


def quit_vscode() -> None:
    """Quit VSCode. Try graceful quit first, then force kill if needed."""
    print("\n=== Quitting VSCode ===")
    # Try AppleScript first (graceful quit)
    subprocess.run(
        ["osascript", "-e", 'tell application "Visual Studio Code" to quit'],
        capture_output=True,
    )
    time.sleep(2)
    
    # Check if still running
    result = subprocess.run(["pgrep", "-x", "Code"], capture_output=True, text=True)
    if result.returncode == 0:
        print("VSCode still running, waiting...")
        time.sleep(3)
        # Check again
        result = subprocess.run(["pgrep", "-x", "Code"], capture_output=True, text=True)
        if result.returncode == 0:
            # Force kill
            print("VSCode refusing to quit, force killing...")
            pids = result.stdout.strip().split("\n")
            for pid in pids:
                if pid:
                    subprocess.run(["kill", "-9", pid], capture_output=True)
            time.sleep(1)
            print("VSCode force killed")
            return
    print("VSCode stopped")


def install_extension() -> None:
    """Install the extension."""
    print("\n=== Installing extension ===")
    if not VSIX_PATH.exists():
        print(f"VSIX not found: {VSIX_PATH}")
        sys.exit(1)
    run([CODE_CLI, "--install-extension", str(VSIX_PATH), "--force"])


def is_vscode_running() -> bool:
    """Check if VSCode is running."""
    result = subprocess.run(["pgrep", "-x", "Code"], capture_output=True, text=True)
    return result.returncode == 0


def ensure_vscode_running() -> None:
    """Ensure VSCode is running. If not, start it."""
    print("\n=== Ensuring VSCode is running ===")
    if is_vscode_running():
        print("VSCode is already running")
    else:
        print("VSCode is not running, starting it...")
        subprocess.Popen(
            ["open", "-a", "Visual Studio Code", str(WORKSPACE_PATH)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print("Waiting for VSCode to start...")
        time.sleep(8)
        print("VSCode started")


def start_vscode() -> None:
    """Start VSCode."""
    print("\n=== Starting VSCode ===")
    subprocess.Popen(
        ["open", "-a", "Visual Studio Code", str(WORKSPACE_PATH)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print("Waiting for VSCode to start...")
    time.sleep(8)


def verify_extension(max_retries: int = 5, retry_interval: int = 3) -> bool:
    """Verify the extension is working with retries."""
    print("\n=== Verifying extension ===")
    scripts_dir = Path(__file__).parent
    os.chdir(scripts_dir)
    
    for attempt in range(1, max_retries + 1):
        print(f"Attempt {attempt}/{max_retries}...")
        result = subprocess.run(
            [sys.executable, "test-ping.py"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            print(result.stdout.strip())
            return True
        
        if attempt < max_retries:
            print(f"  Not ready yet, waiting {retry_interval}s...")
            time.sleep(retry_interval)
    
    print(result.stdout.strip())
    print("Extension verification failed after all retries")
    if result.stderr.strip():
        print(result.stderr.strip())
    return False


def main() -> int:
    print("=== VCC Extension Reload Script ===")
    
    # Step 0: ビルド & パッケージング（事前準備）
    build_extension()
    package_extension()
    
    # Step 1: VSCode 強制起動
    ensure_vscode_running()
    
    # Step 2: 拡張を uninstall
    uninstall_extension()
    
    # Step 3: VSCode を停止
    quit_vscode()
    
    # Step 4: VSCode を再起動
    start_vscode()
    
    # Step 5: 拡張を install
    install_extension()
    
    # Step 6: 検証
    if verify_extension():
        print("\n✅ Extension reloaded successfully!")
        return 0
    else:
        print("\n❌ Extension reload failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
