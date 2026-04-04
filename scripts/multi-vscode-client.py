#!/usr/bin/env python3
"""Compatibility entrypoint for the VCC client library."""

from multi_vscode_client import get_socket_path


if __name__ == "__main__":
    print(f"Socket path: {get_socket_path()}")
