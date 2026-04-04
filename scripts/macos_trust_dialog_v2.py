#!/usr/bin/env python3
"""
VSCode Workspace Trust Manager

Manages VSCode workspace trust by configuring settings, since direct UI automation
is blocked by VSCode's security mechanisms (AXPress and CGEvent are both blocked).

This script provides practical solutions:
1. Disable trust feature globally (recommended for automation)
2. Configure trust settings to be more permissive
3. Check current trust configuration
"""

# =============================================================================
# Coding Guidelines:
# - Python 3.9 syntax only (no match/case, no `X | Y` union syntax)
# - Minimize external dependencies; use stdlib when possible
# - Small library features: embed source directly (self-contained)
# =============================================================================

import sys
import argparse
import json
import os
import shutil
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime


class VSCodeTrustManagerError(Exception):
    """Raised when VSCode trust management operations fail."""
    pass


class VSCodeTrustManager:
    """Manage VSCode workspace trust settings."""
    
    SETTINGS_PATH = Path.home() / "Library/Application Support/Code/User/settings.json"
    
    # Settings keys
    KEY_TRUST_ENABLED = "security.workspace.trust.enabled"
    KEY_UNTRUSTED_FILES = "security.workspace.trust.untrustedFiles"
    KEY_EMPTY_WINDOW = "security.workspace.trust.emptyWindow"
    
    def __init__(self, debug: bool = False):
        self.debug = debug
        self._verify_settings_path()
    
    def _log(self, message: str) -> None:
        """Print debug message if debug mode is enabled."""
        if self.debug:
            print(f"[DEBUG] {message}", file=sys.stderr)
    
    def _verify_settings_path(self) -> None:
        """Verify settings directory exists."""
        if not self.SETTINGS_PATH.parent.exists():
            raise VSCodeTrustManagerError(
                f"VSCode User directory not found: {self.SETTINGS_PATH.parent}\n"
                "Make sure VSCode is installed."
            )
    
    def _read_settings(self) -> Dict[str, Any]:
        """
        Read current VSCode settings.
        
        Returns:
            Dictionary of settings, or empty dict if file doesn't exist
        """
        if not self.SETTINGS_PATH.exists():
            self._log("Settings file doesn't exist, will create new one")
            return {}
        
        try:
            with open(self.SETTINGS_PATH, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if not content:
                    self._log("Settings file is empty")
                    return {}
                return json.loads(content)
        except json.JSONDecodeError as e:
            raise VSCodeTrustManagerError(f"Failed to parse settings.json: {e}")
        except Exception as e:
            raise VSCodeTrustManagerError(f"Failed to read settings: {e}")
    
    def _write_settings(self, settings: Dict[str, Any], backup: bool = True) -> None:
        """
        Write settings to VSCode settings.json.
        
        Args:
            settings: Settings dictionary to write
            backup: Whether to create backup before writing
        """
        try:
            # Create backup if requested and file exists
            if backup and self.SETTINGS_PATH.exists():
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_path = self.SETTINGS_PATH.with_suffix(f".backup.{timestamp}.json")
                shutil.copy2(self.SETTINGS_PATH, backup_path)
                self._log(f"Created backup: {backup_path}")
            
            # Write settings with pretty formatting
            with open(self.SETTINGS_PATH, 'w', encoding='utf-8') as f:
                json.dump(settings, f, indent=4, ensure_ascii=False)
                f.write('\n')  # Add trailing newline
            
            self._log(f"Settings written to {self.SETTINGS_PATH}")
            
        except Exception as e:
            raise VSCodeTrustManagerError(f"Failed to write settings: {e}")
    
    def get_trust_status(self) -> Dict[str, Any]:
        """
        Get current workspace trust configuration.
        
        Returns:
            Dictionary with trust status information
        """
        settings = self._read_settings()
        
        trust_enabled = settings.get(self.KEY_TRUST_ENABLED, True)  # Default is True
        untrusted_files = settings.get(self.KEY_UNTRUSTED_FILES, "prompt")  # Default is "prompt"
        empty_window = settings.get(self.KEY_EMPTY_WINDOW, True)  # Default is True
        
        status = {
            "trust_enabled": trust_enabled,
            "untrusted_files": untrusted_files,
            "empty_window": empty_window,
            "will_show_dialog": trust_enabled  # Dialog shows when trust is enabled
        }
        
        return status
    
    def disable_trust(self) -> bool:
        """
        Disable workspace trust feature entirely.
        
        This is the most reliable way to prevent trust dialogs.
        
        Returns:
            True if successful
        """
        try:
            self._log("Disabling workspace trust feature...")
            
            settings = self._read_settings()
            settings[self.KEY_TRUST_ENABLED] = False
            
            self._write_settings(settings, backup=True)
            
            print(f"✓ Workspace trust disabled")
            print(f"  {self.KEY_TRUST_ENABLED} = false")
            print(f"\nVSCode will no longer show trust dialogs.")
            print(f"Note: You may need to restart VSCode for changes to take effect.")
            
            return True
            
        except VSCodeTrustManagerError as e:
            print(f"Error: {e}", file=sys.stderr)
            return False
    
    def enable_trust(self) -> bool:
        """
        Enable workspace trust feature.
        
        Returns:
            True if successful
        """
        try:
            self._log("Enabling workspace trust feature...")
            
            settings = self._read_settings()
            settings[self.KEY_TRUST_ENABLED] = True
            
            self._write_settings(settings, backup=True)
            
            print(f"✓ Workspace trust enabled")
            print(f"  {self.KEY_TRUST_ENABLED} = true")
            print(f"\nVSCode will show trust dialogs for untrusted workspaces.")
            
            return True
            
        except VSCodeTrustManagerError as e:
            print(f"Error: {e}", file=sys.stderr)
            return False
    
    def configure_permissive(self) -> bool:
        """
        Configure trust settings to be more permissive.
        
        This keeps trust enabled but automatically opens untrusted files
        without prompting.
        
        Returns:
            True if successful
        """
        try:
            self._log("Configuring permissive trust settings...")
            
            settings = self._read_settings()
            settings[self.KEY_TRUST_ENABLED] = True
            settings[self.KEY_UNTRUSTED_FILES] = "open"  # Open files without prompt
            settings[self.KEY_EMPTY_WINDOW] = False  # Don't restrict empty windows
            
            self._write_settings(settings, backup=True)
            
            print(f"✓ Trust configured to be more permissive")
            print(f"  {self.KEY_TRUST_ENABLED} = true")
            print(f"  {self.KEY_UNTRUSTED_FILES} = 'open'")
            print(f"  {self.KEY_EMPTY_WINDOW} = false")
            print(f"\nVSCode will still track trust but be less intrusive.")
            
            return True
            
        except VSCodeTrustManagerError as e:
            print(f"Error: {e}", file=sys.stderr)
            return False
    
    def check_status(self) -> bool:
        """
        Check and display current trust configuration.
        
        Returns:
            True if successful
        """
        try:
            status = self.get_trust_status()
            
            print("=== VSCode Workspace Trust Status ===\n")
            print(f"Trust Feature Enabled: {status['trust_enabled']}")
            print(f"Untrusted Files Action: {status['untrusted_files']}")
            print(f"Empty Window Restriction: {status['empty_window']}")
            print(f"\nWill Show Trust Dialog: {status['will_show_dialog']}")
            
            if status['will_show_dialog']:
                print("\n⚠️  Trust dialogs will appear for new workspaces")
                print("   Run 'trust disable' to prevent dialogs")
            else:
                print("\n✓ Trust dialogs are disabled")
            
            print(f"\nSettings file: {self.SETTINGS_PATH}")
            
            return True
            
        except VSCodeTrustManagerError as e:
            print(f"Error: {e}", file=sys.stderr)
            return False
    
    def reset_to_default(self) -> bool:
        """
        Reset trust settings to VSCode defaults.
        
        Returns:
            True if successful
        """
        try:
            self._log("Resetting trust settings to defaults...")
            
            settings = self._read_settings()
            
            # Remove trust-related keys (VSCode will use defaults)
            removed = []
            for key in [self.KEY_TRUST_ENABLED, self.KEY_UNTRUSTED_FILES, self.KEY_EMPTY_WINDOW]:
                if key in settings:
                    del settings[key]
                    removed.append(key)
            
            if removed:
                self._write_settings(settings, backup=True)
                print(f"✓ Trust settings reset to defaults")
                print(f"  Removed: {', '.join(removed)}")
            else:
                print(f"✓ No trust settings to remove (already using defaults)")
            
            print(f"\nVSCode will use default trust behavior:")
            print(f"  - Trust dialogs enabled")
            print(f"  - Prompt for untrusted files")
            
            return True
            
        except VSCodeTrustManagerError as e:
            print(f"Error: {e}", file=sys.stderr)
            return False


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Manage VSCode Workspace Trust settings",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Commands:
  check       Check current trust configuration
  disable     Disable trust feature (no dialogs, recommended for automation)
  enable      Enable trust feature (show dialogs for untrusted workspaces)
  permissive  Keep trust enabled but be less intrusive
  reset       Reset trust settings to VSCode defaults

Examples:
  %(prog)s check              Check current trust status
  %(prog)s disable            Disable trust dialogs completely
  %(prog)s permissive         Keep trust but auto-open untrusted files
  %(prog)s --debug disable    Run with debug output

Why UI automation doesn't work:
  VSCode blocks both AXPress and CGEvent APIs for security dialogs,
  making it impossible to click the trust button programmatically.
  This tool takes the practical approach of configuring settings instead.
        """
    )
    
    parser.add_argument(
        "command",
        choices=["check", "disable", "enable", "permissive", "reset"],
        help="Command to execute"
    )
    
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug output"
    )
    
    args = parser.parse_args()
    
    try:
        manager = VSCodeTrustManager(debug=args.debug)
        
        if args.command == "check":
            success = manager.check_status()
        elif args.command == "disable":
            success = manager.disable_trust()
        elif args.command == "enable":
            success = manager.enable_trust()
        elif args.command == "permissive":
            success = manager.configure_permissive()
        elif args.command == "reset":
            success = manager.reset_to_default()
        else:
            print(f"Unknown command: {args.command}", file=sys.stderr)
            return 1
        
        return 0 if success else 1
        
    except VSCodeTrustManagerError as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
