#!/usr/bin/env python3
"""Test ping/pong functionality."""

import sys
from multi_vscode_client import send_request


def main() -> int:
    print("Testing ping...")

    try:
        response = send_request("ping")

        if "result" in response:
            result = response["result"]
            print("✅ Pong received!")
            print(f"   Message: {result.get('message')}")
            print(f"   Timestamp: {result.get('timestamp')}")
            return 0
        if "error" in response:
            error = response["error"]
            print(f"❌ Error: {error.get('message')}")
            return 1

        print(f"❌ Unexpected response: {response}")
        return 1
    except FileNotFoundError:
        print("❌ Socket not found. Is VSCode running with the extension?")
        return 1
    except ConnectionRefusedError:
        print("❌ Connection refused. Is the extension activated?")
        return 1
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
