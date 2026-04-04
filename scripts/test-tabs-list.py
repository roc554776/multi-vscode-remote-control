#!/usr/bin/env python3
"""Test tabs.list functionality."""

import sys
from multi_vscode_client import send_request


def main() -> int:
    print("Getting tab list...")

    try:
        response = send_request("tabs.list")

        if "result" in response:
            result = response["result"]
            tabs = result.get("tabs", [])
            active_uri = result.get("activeTabUri")

            print(f"✅ Found {len(tabs)} tab(s)")
            print(f"   Active tab URI: {active_uri}")
            print()

            for i, tab in enumerate(tabs):
                status = []
                if tab.get("isActive"):
                    status.append("ACTIVE")
                if tab.get("isDirty"):
                    status.append("DIRTY")
                status_str = f" [{', '.join(status)}]" if status else ""

                print(f"   [{i}] {tab.get('label')}{status_str}")
                print(f"       URI: {tab.get('uri')}")
                print(f"       Group: {tab.get('groupIndex')}, Index: {tab.get('index')}")

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
