#!/usr/bin/env python3
"""
Peekaboo Bridge API クライアント

Bridge API を直接使用してクリック操作を行う。
Python 3.9 互換。
"""

import argparse
import json
import os
import socket
import sys
from typing import Any, Dict, Optional, Union


DEFAULT_SOCKET_PATH = os.path.expanduser("~/Library/Application Support/Peekaboo/bridge.sock")
SOCKET_PATH = os.environ.get("PEEKABOO_BRIDGE_SOCKET", DEFAULT_SOCKET_PATH)


class PeekabooBridgeError(Exception):
    """Bridge API からのエラーレスポンス"""
    def __init__(self, code: str, message: str, details: Optional[str] = None):
        self.code = code
        self.message = message
        self.details = details
        super().__init__(f"Bridge Error [{code}]: {message}")


class PeekabooBridgeClient:
    """Peekaboo Bridge API クライアント"""
    
    def __init__(self, socket_path: str = SOCKET_PATH):
        self.socket_path = socket_path
    
    def _send_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Bridge にリクエストを送信してレスポンスを受信する。
        
        1接続1リクエストモデル:
        - JSON リクエストを送信
        - shutdown(SHUT_WR) で half-close
        - レスポンスを EOF まで読み込む
        """
        data = json.dumps(request).encode("utf-8")
        
        if os.environ.get("PEEKABOO_DEBUG"):
            print(f"[DEBUG] Request JSON:\n{json.dumps(request, indent=2)}", file=sys.stderr)
        
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
                # 接続
                s.connect(self.socket_path)
                
                # リクエスト送信
                s.sendall(data)
                
                # half-close: クライアント側の送信を終了
                # サーバーは EOF でリクエスト完了を検知
                s.shutdown(socket.SHUT_WR)
                
                # レスポンス受信
                chunks = []
                while True:
                    chunk = s.recv(65536)
                    if not chunk:
                        break
                    chunks.append(chunk)
                
        except FileNotFoundError:
            raise ConnectionError(
                f"Bridge socket not found: {self.socket_path}\n"
                "Peekaboo daemon が起動していません。"
            )
        except ConnectionRefusedError:
            raise ConnectionError(
                f"Connection refused: {self.socket_path}\n"
                "Peekaboo daemon に接続できません。"
            )
        except Exception as e:
            raise ConnectionError(f"Socket error: {e}")
        
        # レスポンスをパース
        raw = b"".join(chunks)
        if not raw:
            raise RuntimeError("Empty response from bridge")
        
        if os.environ.get("PEEKABOO_DEBUG"):
            print(f"[DEBUG] Response JSON:\n{json.dumps(json.loads(raw.decode('utf-8')), indent=2)}", file=sys.stderr)
        
        try:
            response = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Invalid JSON response: {e}\nRaw: {raw[:200]}")
        
        # エラーレスポンスをチェック
        if "error" in response:
            error_data = response["error"]["_0"]
            raise PeekabooBridgeError(
                code=error_data.get("code", "unknown"),
                message=error_data.get("message", "Unknown error"),
                details=error_data.get("details")
            )
        
        return response
    
    def handshake(self) -> Dict[str, Any]:
        """
        Bridge との handshake を実行。
        
        Returns:
            Handshake レスポンス（permissions, enabledOperations など）
        """
        request = {
            "handshake": {
                "_0": {
                    "protocolVersion": {"major": 1, "minor": 0},
                    "client": {
                        "bundleIdentifier": "dev.roc.peekaboo-bridge-client",
                        "teamIdentifier": None,  # 未署名（同一UID認証）
                        "processIdentifier": os.getpid(),
                        "hostname": socket.gethostname(),
                    },
                    "requestedHostKind": None
                }
            }
        }
        
        response = self._send_request(request)
        
        if "handshake" not in response:
            raise RuntimeError(f"Unexpected handshake response: {response}")
        
        return response["handshake"]["_0"]
    
    def click_element(
        self, 
        element_id: str, 
        click_type: str = "single",
        snapshot_id: Optional[str] = None
    ) -> None:
        """
        要素 ID でクリック。
        
        Args:
            element_id: 要素ID（例: "B1", "B2"）
            click_type: "single", "right", "double"
            snapshot_id: スナップショットID（オプション）
        """
        request = {
            "click": {
                "_0": {
                    "target": {"kind": "elementId", "value": element_id},
                    "clickType": click_type,
                    "snapshotId": snapshot_id
                }
            }
        }
        
        response = self._send_request(request)
        
        if "ok" not in response:
            raise RuntimeError(f"Unexpected click response: {response}")
    
    def click_coords(
        self, 
        x: float, 
        y: float, 
        click_type: str = "single"
    ) -> None:
        """
        座標でクリック。
        
        Args:
            x: X座標
            y: Y座標
            click_type: "single", "right", "double"
        """
        request = {
            "click": {
                "_0": {
                    "target": {"kind": "coordinates", "x": x, "y": y},
                    "clickType": click_type,
                    "snapshotId": None
                }
            }
        }
        
        response = self._send_request(request)
        
        if "ok" not in response:
            raise RuntimeError(f"Unexpected click response: {response}")
    
    def click_text(
        self, 
        text: str, 
        click_type: str = "single"
    ) -> None:
        """
        テキスト検索でクリック。
        
        Args:
            text: 検索するテキスト
            click_type: "single", "right", "double"
        """
        request = {
            "click": {
                "_0": {
                    "target": {"kind": "query", "value": text},
                    "clickType": click_type,
                    "snapshotId": None
                }
            }
        }
        
        response = self._send_request(request)
        
        if "ok" not in response:
            raise RuntimeError(f"Unexpected click response: {response}")


def main() -> int:
    """CLI エントリーポイント"""
    parser = argparse.ArgumentParser(
        description="Peekaboo Bridge API クライアント",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用例:
  %(prog)s handshake
  %(prog)s click --element B1
  %(prog)s click --coords 100,200
  %(prog)s click --text "Yes, I trust"
  %(prog)s click --element B2 --type double
  %(prog)s --socket ~/Library/Application\\ Support/OpenClaw/bridge.sock handshake
        """
    )
    
    parser.add_argument(
        "--socket",
        default=SOCKET_PATH,
        help=f"Bridge socket path (default: {SOCKET_PATH})"
    )
    
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # handshake コマンド
    parser_handshake = subparsers.add_parser(
        "handshake",
        help="Bridge との handshake を実行"
    )
    
    # click コマンド
    parser_click = subparsers.add_parser(
        "click",
        help="クリック操作を実行"
    )
    parser_click.add_argument(
        "--element",
        help="要素ID（例: B1）"
    )
    parser_click.add_argument(
        "--coords",
        help="座標（例: 100,200）"
    )
    parser_click.add_argument(
        "--text",
        help="テキスト検索（例: 'Yes, I trust'）"
    )
    parser_click.add_argument(
        "--type",
        default="single",
        choices=["single", "right", "double"],
        help="クリックタイプ（デフォルト: single）"
    )
    
    args = parser.parse_args()
    
    # クライアント初期化
    socket_path = os.path.expanduser(args.socket)
    client = PeekabooBridgeClient(socket_path=socket_path)
    
    try:
        if args.command == "handshake":
            # Handshake 実行
            result = client.handshake()
            print("✅ Handshake successful!")
            print(f"\nProtocol version: {result['negotiatedVersion']['major']}.{result['negotiatedVersion']['minor']}")
            print(f"Host kind: {result['hostKind']}")
            print(f"Build: {result['build']}")
            print(f"\nSupported operations: {', '.join(result['supportedOperations'])}")
            print(f"Enabled operations: {', '.join(result['enabledOperations'])}")
            
            # Permissions 表示
            perms = result['permissions']
            print(f"\n📋 Permissions:")
            print(f"  Screen Recording: {'✅' if perms['screenRecording'] else '❌'}")
            print(f"  Accessibility: {'✅' if perms['accessibility'] else '❌'}")
            print(f"  AppleScript: {'✅' if perms.get('appleScript', False) else '❌'}")
            
            if not perms['allGranted']:
                print(f"\n⚠️  Missing permissions: {', '.join(perms['missingPermissions'])}")
            
            return 0
        
        elif args.command == "click":
            # クリックモード判定
            if args.element:
                print(f"🖱️  Clicking element '{args.element}' ({args.type})...")
                client.click_element(args.element, click_type=args.type)
            
            elif args.coords:
                coords = args.coords.split(",")
                if len(coords) != 2:
                    print("❌ Error: --coords must be in format 'x,y'", file=sys.stderr)
                    return 1
                try:
                    x, y = float(coords[0]), float(coords[1])
                except ValueError:
                    print("❌ Error: coordinates must be numeric", file=sys.stderr)
                    return 1
                
                print(f"🖱️  Clicking coordinates ({x}, {y}) ({args.type})...")
                client.click_coords(x, y, click_type=args.type)
            
            elif args.text:
                print(f"🖱️  Clicking text '{args.text}' ({args.type})...")
                client.click_text(args.text, click_type=args.type)
            
            else:
                print("❌ Error: must specify one of --element, --coords, or --text", file=sys.stderr)
                return 1
            
            print("✅ Click successful!")
            return 0
        
    except PeekabooBridgeError as e:
        print(f"❌ Bridge Error [{e.code}]: {e.message}", file=sys.stderr)
        if e.details:
            print(f"   Details: {e.details}", file=sys.stderr)
        return 1
    
    except ConnectionError as e:
        print(f"❌ Connection Error: {e}", file=sys.stderr)
        return 1
    
    except Exception as e:
        print(f"❌ Unexpected Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
