#!/usr/bin/env python3
"""Test chat.query command - sends prompt and gets response from Copilot."""

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
    prompt = sys.argv[1] if len(sys.argv) > 1 else "What is 2+2? Reply with just the number."
    
    print(f"Testing chat.query with prompt: {prompt}")
    print("Waiting for response...")
    
    result = send_request("chat.query", {"prompt": prompt})
    
    if "error" in result:
        print(f"Error: {result['error']}")
        return 1
    
    response = result.get("result", {})
    print(f"\n=== Response ===")
    print(f"Model: {response.get('model', 'unknown')}")
    print(f"Response: {response.get('response', '')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
