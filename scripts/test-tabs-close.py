#!/usr/bin/env python3
"""Test tabs.close functionality."""

import sys
from multi_vscode_client import send_request


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python3 test-tabs-close.py <uri> [--save]")
        print()
        print("Arguments:")
        print("  uri     The URI of the tab to close (e.g., file:///path/to/file.ts)")
        print("  --save  Save changes before closing (optional)")
        print()
        print("Tip: Use test-tabs-list.py to get tab URIs")
        return 1

    uri = sys.argv[1]
    save = "--save" in sys.argv

    print(f"Closing tab: {uri}")
    print(f"Save changes: {save}")

    try:
        response = send_request("tabs.close", {"uri": uri, "save": save})

        if "result" in response:
            result = response["result"]
            success = result.get("success")
            closed = result.get("closed")

            if success and closed:
                print("✅ Tab closed successfully")
            elif success and not closed:
                print("⚠️ Tab not found (already closed?)")
            else:
                print("❌ Failed to close tab")

            return 0 if success else 1
        if "error" in response:
            error = response["error"]
            print(f"❌ Error: {error.get('message')}")
            if "data" in error:
                print(f"   Details: {error['data']}")
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
