#!/usr/bin/env python3
"""VCC Remote Control IPC Client Library"""

import json
import socket
import sys
from pathlib import Path
from typing import Any, Dict, Optional


def get_socket_path() -> str:
    """Get the IPC socket path based on platform."""
    if sys.platform == "win32":
        return r"\\.\pipe\multi-vscode-remote-control"
    return str(Path.home() / ".multi-vscode" / "vcc.sock")


def send_request(
    method: str, params: Optional[Dict[str, Any]] = None, request_id: int = 1
) -> Dict[str, Any]:
    """Send a JSON-RPC request to the VCC extension."""
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


if __name__ == "__main__":
    # Simple test
    print(f"Socket path: {get_socket_path()}")
