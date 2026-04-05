#!/usr/bin/env python3
"""Test chat.newSession command."""

# =============================================================================
# Coding Guidelines:
# - Python 3.9 syntax only (no match/case, no `X | Y` union syntax)
# - Minimize external dependencies; use stdlib when possible
# - Small library features: embed source directly (self-contained)
# - If external deps needed: use PEP 723 + `uv run`
# =============================================================================

import sys
sys.path.insert(0, '.')

from multi_vscode_client import send_request

def main() -> int:
    print("Testing chat.newSession...")
    result = send_request("chat.newSession")
    
    if "error" in result:
        print(f"Error: {result['error']}")
        return 1
    
    print(f"Result: {result.get('result')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
