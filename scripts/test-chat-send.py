#!/usr/bin/env python3
"""Test chat.send command."""

# =============================================================================
# Coding Guidelines:
# - Python 3.9 syntax only (no match/case, no `X | Y` union syntax)
# - Minimize external dependencies; use stdlib when possible
# - Small library features: embed source directly (self-contained)
# - If external deps needed: use PEP 723 + `uv run`
# =============================================================================

import argparse
import json
import socket
import sys
from pathlib import Path
from typing import Any, Dict, Optional


def get_socket_path() -> str:
    """Get the IPC socket path for multi-vscode-remote-control daemon."""
    if sys.platform == "win32":
        return r"\\.\pipe\multi-vscode-remote-control"
    return str(Path.home() / ".multi-vscode-remote-control" / "daemon.sock")


def send_request(
    method: str, params: Optional[Dict[str, Any]] = None, request_id: int = 1
) -> Dict[str, Any]:
    """Send a JSON-RPC request to the multi-vscode-remote-control daemon."""
    socket_path = get_socket_path()

    request = {
        "jsonrpc": "2.0",
        "method": method,
        "id": request_id,
    }
    if params is not None:
        request["params"] = params

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        sock.connect(socket_path)
        sock.sendall((json.dumps(request) + "\n").encode("utf-8"))

        response_data = b""
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            response_data += chunk
            if b"\n" in response_data:
                break

        response_str = response_data.decode("utf-8").strip()
        return json.loads(response_str)
    finally:
        sock.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Test chat.send command")
    parser.add_argument("prompt", nargs="?", default="Hello, Copilot!")
    parser.add_argument(
        "--sync",
        action="store_true",
        help="Wait for response completion",
    )
    args = parser.parse_args()

    params = {"prompt": args.prompt}
    if args.sync:
        params["sync"] = True

    mode = "sync" if args.sync else "async"
    print(f"Testing chat.send ({mode}) with prompt: {args.prompt}")
    result = send_request("chat.send", params)

    if "error" in result:
        print(f"Error: {result['error']}")
        return 1

    if args.sync:
        response = result.get("result")
        if isinstance(response, dict):
            error = response.get("error")
            if error:
                print(f"Response error: {error}")
                return 1

    print(f"Result: {result.get('result')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
