#!/usr/bin/env python3
"""Control VSCode Workspace Trust behavior.

⚠️  IMPORTANT LIMITATION:
    The 'click-trust' command CANNOT actually automate the Trust dialog due to
    security protections in VSCode/Electron. The dialog intentionally blocks
    all programmatic interactions (keyboard, mouse, accessibility APIs).
    
    RECOMMENDED: Use the 'trust' command to disable Workspace Trust globally:
        python3 macos_trust_dialog.py trust
"""

# =============================================================================
# Coding Guidelines:
# - Python 3.9 syntax only (no match/case, no `X | Y` union syntax)
# - Minimize external dependencies; use stdlib when possible
# - Small library features: embed source directly (self-contained)
# - If external deps needed: use PEP 723 + `uv run`
# =============================================================================

import sys
import argparse
import subprocess
import json
import time
import os
from typing import Optional, Dict, Any, List


class PeekabooError(Exception):
    """Raised when peekaboo operations fail."""
    pass


class VSCodeTrustDialogController:
    """Controller for VSCode Workspace Trust dialog and trust settings."""
    
    PEEKABOO_PATH = "/Users/roc/.local/bin/peekaboo"
    BRIDGE_SOCKET = os.path.expanduser("~/Library/Application Support/OpenClaw/bridge.sock")
    VSCODE_SETTINGS_PATH = os.path.expanduser("~/Library/Application Support/Code/User/settings.json")
    
    VSCODE_APP_NAMES = ["Code", "Code - Insiders", "VSCode"]
    TRUST_KEYWORDS = ["trust", "workspace", "authors"]
    
    # Maximum number of Tab presses to find Trust button
    MAX_TAB_ATTEMPTS = 10
    
    def __init__(self, debug: bool = False):
        self.debug = debug
        self._verify_peekaboo()
    
    def _log(self, message: str) -> None:
        """Print debug message if debug mode is enabled."""
        if self.debug:
            print(f"[DEBUG] {message}", file=sys.stderr)
    
    def _verify_peekaboo(self) -> None:
        """Verify peekaboo is installed and accessible."""
        if not os.path.exists(self.PEEKABOO_PATH):
            raise PeekabooError(
                f"peekaboo not found at {self.PEEKABOO_PATH}\n"
                "Install peekaboo first."
            )
        
        if not os.path.exists(self.BRIDGE_SOCKET):
            self._log(f"Warning: Bridge socket not found at {self.BRIDGE_SOCKET}")

    def _load_vscode_settings(self) -> Dict[str, Any]:
        """
        Load VSCode settings.json.

        Returns:
            Parsed settings dictionary

        Raises:
            PeekabooError: If settings file cannot be read/parsed
        """
        path = self.VSCODE_SETTINGS_PATH
        if not os.path.exists(path):
            self._log("settings.json does not exist; using empty settings")
            return {}

        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if not content:
                    return {}
                data = json.loads(content)
                if not isinstance(data, dict):
                    raise PeekabooError(f"Invalid settings format in {path}: expected JSON object")
                return data
        except json.JSONDecodeError as e:
            raise PeekabooError(
                "Failed to parse VSCode settings.json as JSON. "
                "Please remove JSON comments/trailing commas and retry. "
                f"Details: {e}"
            )
        except OSError as e:
            raise PeekabooError(f"Failed to read {path}: {e}")

    def _save_vscode_settings(self, settings: Dict[str, Any]) -> None:
        """
        Save VSCode settings.json.

        Args:
            settings: Settings dictionary to save

        Raises:
            PeekabooError: If settings file cannot be written
        """
        path = self.VSCODE_SETTINGS_PATH
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(settings, f, ensure_ascii=False, indent=4)
                f.write("\n")
        except OSError as e:
            raise PeekabooError(f"Failed to write {path}: {e}")

    def set_workspace_trust_enabled(self, enabled: bool) -> bool:
        """
        Enable/disable VSCode Workspace Trust globally via settings.json.

        Args:
            enabled: Desired value for security.workspace.trust.enabled

        Returns:
            True if setting is now in desired state
        """
        settings = self._load_vscode_settings()
        key = "security.workspace.trust.enabled"
        previous = settings.get(key)
        settings[key] = enabled
        self._save_vscode_settings(settings)

        state = "enabled" if enabled else "disabled"
        if previous == enabled:
            print(f"✓ Workspace Trust already {state} ({key}={enabled})")
        else:
            print(f"✓ Workspace Trust {state} ({key}: {previous} -> {enabled})")

        return True
    
    def _run_peekaboo(self, args: List[str], capture_output: bool = True) -> Optional[str]:
        """
        Run peekaboo command.
        
        Args:
            args: Command arguments (not including peekaboo path)
            capture_output: Whether to capture stdout
            
        Returns:
            stdout if capture_output=True, None otherwise
            
        Raises:
            PeekabooError: If command fails
        """
        cmd = [self.PEEKABOO_PATH] + args + ["--bridge-socket", self.BRIDGE_SOCKET]
        
        self._log(f"Running: {' '.join(cmd)}")
        
        try:
            if capture_output:
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                if result.returncode != 0:
                    error_msg = result.stderr.strip() if result.stderr else "Unknown error"
                    raise PeekabooError(f"peekaboo failed: {error_msg}")
                
                return result.stdout
            else:
                subprocess.run(cmd, check=True, timeout=10)
                return None
                
        except subprocess.TimeoutExpired:
            raise PeekabooError("peekaboo command timed out")
        except subprocess.CalledProcessError as e:
            raise PeekabooError(f"peekaboo command failed: {e}")
        except Exception as e:
            raise PeekabooError(f"Failed to run peekaboo: {e}")
    
    def _capture_vscode_ui(self) -> Optional[Dict[str, Any]]:
        """
        Capture VSCode UI using peekaboo see.
        
        Returns:
            Parsed JSON data from peekaboo, or None if VSCode not found
        """
        # Try each VSCode app name
        for app_name in self.VSCODE_APP_NAMES:
            try:
                self._log(f"Attempting to capture UI for app: {app_name}")
                output = self._run_peekaboo(["see", "--app", app_name, "--json"])
                
                if output:
                    data = json.loads(output)
                    self._log(f"Successfully captured UI for {app_name}")
                    return data
                    
            except (PeekabooError, json.JSONDecodeError) as e:
                self._log(f"Failed to capture {app_name}: {e}")
                continue
        
        return None
    
    def _search_text_recursive(
        self,
        element: Any,
        keywords: List[str],
        max_depth: int = 10,
        current_depth: int = 0
    ) -> bool:
        """
        Recursively search for keywords in UI element tree.
        
        Args:
            element: UI element (dict or other type)
            keywords: List of keywords to search for
            max_depth: Maximum recursion depth
            current_depth: Current recursion depth
            
        Returns:
            True if any keyword found, False otherwise
        """
        if current_depth > max_depth:
            return False
        
        # Handle different element types
        if isinstance(element, dict):
            # Search in common text fields
            text_fields = ["text", "title", "label", "value", "description", "name"]
            
            for field in text_fields:
                if field in element and element[field]:
                    text = str(element[field]).lower()
                    for keyword in keywords:
                        if keyword.lower() in text:
                            self._log(f"Found keyword '{keyword}' in {field}: {element[field]}")
                            return True
            
            # Search children
            if "children" in element and isinstance(element["children"], list):
                for child in element["children"]:
                    if self._search_text_recursive(child, keywords, max_depth, current_depth + 1):
                        return True
            
            # Search other nested structures
            for key, value in element.items():
                if key not in ["children"] and isinstance(value, (dict, list)):
                    if self._search_text_recursive(value, keywords, max_depth, current_depth + 1):
                        return True
        
        elif isinstance(element, list):
            for item in element:
                if self._search_text_recursive(item, keywords, max_depth, current_depth + 1):
                    return True
        
        elif isinstance(element, str):
            text = element.lower()
            for keyword in keywords:
                if keyword.lower() in text:
                    self._log(f"Found keyword '{keyword}' in string: {element}")
                    return True
        
        return False
    
    def _has_trust_dialog(self, ui_data: Dict[str, Any]) -> bool:
        """
        Check if UI data contains trust dialog elements.
        
        Args:
            ui_data: Parsed JSON from peekaboo see
            
        Returns:
            True if trust dialog detected, False otherwise
        """
        self._log("Searching for trust dialog in UI data...")
        return self._search_text_recursive(ui_data, self.TRUST_KEYWORDS)
    
    def _focus_vscode(self) -> bool:
        """
        Focus VSCode application.
        
        Returns:
            True if successful, False otherwise
        """
        for app_name in self.VSCODE_APP_NAMES:
            try:
                self._log(f"Attempting to focus app: {app_name}")
                self._run_peekaboo(["app", "switch", "--to", app_name], capture_output=False)
                self._log(f"Focused {app_name}")
                time.sleep(0.5)  # Wait for focus to settle
                return True
            except PeekabooError:
                continue
        
        return False
    
    def _press_key(self, key: str) -> None:
        """
        Press individual key.
        
        Args:
            key: Key name (e.g., "tab", "space", "return")
        """
        self._log(f"Pressing key: {key}")
        self._run_peekaboo(["press", key], capture_output=False)
        time.sleep(0.2)  # Small delay between keypresses
    
    def check_dialog_exists(self) -> bool:
        """
        Check if Workspace Trust dialog exists.
        
        Returns:
            True if dialog found, False otherwise
        """
        try:
            ui_data = self._capture_vscode_ui()
            
            if ui_data is None:
                print("✗ VSCode is not running", file=sys.stderr)
                return False
            
            if self._has_trust_dialog(ui_data):
                print("✓ Workspace Trust dialog found")
                return True
            else:
                print("✗ Workspace Trust dialog not found")
                return False
                
        except PeekabooError as e:
            print(f"Error: {e}", file=sys.stderr)
            return False
    
    def trust_workspace(self) -> bool:
        """
        Click "Yes, I trust the authors" button using keyboard navigation.
        
        Strategy:
        1. Verify dialog exists
        2. Focus VSCode window
        3. Press Tab multiple times to navigate to Trust button
        4. Press Space/Enter to activate button
        5. Verify dialog disappeared
        
        Returns:
            True if successful, False otherwise
        """
        try:
            # Step 1: Check if dialog exists
            self._log("Step 1: Checking if trust dialog exists...")
            ui_data = self._capture_vscode_ui()
            
            if ui_data is None:
                print("Error: VSCode is not running", file=sys.stderr)
                return False
            
            if not self._has_trust_dialog(ui_data):
                print("Error: Workspace Trust dialog not found", file=sys.stderr)
                return False
            
            self._log("Trust dialog confirmed")
            
            # Step 2: Focus VSCode
            self._log("Step 2: Focusing VSCode window...")
            if not self._focus_vscode():
                print("Error: Failed to focus VSCode", file=sys.stderr)
                return False
            
            # Step 3: Try to click the trust button
            # Note: VSCode Trust dialog appears to be protected from automation
            # Testing multiple approaches...
            self._log("Step 3: Attempting to activate Trust button...")
            
            # Approach 1: Try clicking button directly by text
            try:
                self._log("Approach 1: Clicking button by text query...")
                self._run_peekaboo(["click", "Yes, I trust the authors"], capture_output=False)
                time.sleep(1.0)
                
                ui_data = self._capture_vscode_ui()
                if ui_data and not self._has_trust_dialog(ui_data):
                    print("✓ Successfully clicked trust button (method: text query)")
                    return True
            except PeekabooError as e:
                self._log(f"Text query click failed: {e}")
            
            # Approach 2: Try pressing Return key (in case button is already focused)
            self._log("Approach 2: Pressing Return key...")
            self._press_key("return")
            time.sleep(1.0)
            
            ui_data = self._capture_vscode_ui()
            if ui_data and not self._has_trust_dialog(ui_data):
                print("✓ Successfully activated trust button (method: Return key)")
                return True
            
            # Approach 3: Try Tab + Space navigation
            self._log("Approach 3: Tab navigation...")
            for attempt in range(3):
                self._press_key("tab")
                self._press_key("space")
                time.sleep(0.5)
                
                ui_data = self._capture_vscode_ui()
                if ui_data and not self._has_trust_dialog(ui_data):
                    print(f"✓ Successfully activated trust button (method: Tab+Space, attempt {attempt + 1})")
                    return True
            
            print("✗ Failed to dismiss trust dialog using automation", file=sys.stderr)
            print("", file=sys.stderr)
            print("REASON: VSCode Trust dialog is protected from programmatic interaction.", file=sys.stderr)
            print("This is a security feature to prevent malicious scripts from auto-trusting workspaces.", file=sys.stderr)
            print("", file=sys.stderr)
            print("WORKAROUND: Use 'trust' command to disable Workspace Trust globally:", file=sys.stderr)
            print(f"  {sys.argv[0]} trust", file=sys.stderr)
            return False
                
        except PeekabooError as e:
            print(f"Error: {e}", file=sys.stderr)
            return False


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Control VSCode Workspace Trust dialog/settings",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s check          Check if trust dialog exists
  %(prog)s click-trust    Attempt to click trust button (⚠️  WILL NOT WORK - see below)
  %(prog)s trust          Disable Workspace Trust globally (✅ RECOMMENDED)
  %(prog)s enable-trust   Re-enable Workspace Trust globally
  %(prog)s --debug trust  Run with debug output

⚠️  SECURITY LIMITATION:
  The 'click-trust' command cannot automate the Trust dialog due to intentional
  security protections in VSCode/Electron. The dialog blocks all programmatic
  interactions to prevent malicious scripts from auto-trusting workspaces.
  
  Use 'trust' command instead to disable Workspace Trust via settings.json.
        """
    )
    
    parser.add_argument(
        "command",
        choices=["check", "click-trust", "trust", "enable-trust"],
        help="Command to execute"
    )
    
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug output"
    )
    
    args = parser.parse_args()
    
    try:
        controller = VSCodeTrustDialogController(debug=args.debug)
        
        if args.command == "check":
            success = controller.check_dialog_exists()
            return 0 if success else 1
        
        elif args.command == "click-trust":
            success = controller.trust_workspace()
            return 0 if success else 1

        elif args.command == "trust":
            success = controller.set_workspace_trust_enabled(False)
            return 0 if success else 1

        elif args.command == "enable-trust":
            success = controller.set_workspace_trust_enabled(True)
            return 0 if success else 1
        
        return 1
        
    except PeekabooError as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
