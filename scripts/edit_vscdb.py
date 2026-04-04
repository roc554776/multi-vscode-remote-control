#!/usr/bin/env python3
"""
Edit VSCode's state.vscdb database safely with automatic VSCode shutdown.

This script ensures VSCode is completely stopped before executing SQL commands
to prevent database corruption. It handles graceful shutdown and force kill if needed.

Usage:
    python3 edit_vscdb.py --sql "SELECT * FROM ItemTable"
    python3 edit_vscdb.py --sql "UPDATE ItemTable SET value = '{}' WHERE key = 'test'" --db ~/custom/path/state.vscdb

Arguments:
    --sql: SQL statement to execute (required)
    --db: Path to state.vscdb (optional, default: ~/Library/Application Support/Code/User/globalStorage/state.vscdb)

Requirements:
    - VSCode will be automatically stopped before running SQL
    - The script will verify VSCode is not running before making changes
"""

import argparse
import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

# Default configuration
DEFAULT_VSCODE_STATE_DB = Path.home() / "Library/Application Support/Code/User/globalStorage/state.vscdb"


def is_vscode_running() -> bool:
    """Check if VSCode is currently running for the current user."""
    try:
        # Check for VSCode processes owned by the current user
        current_user = os.environ.get('USER', '')
        result = subprocess.run(
            ["ps", "-u", current_user, "-o", "pid,comm"],
            capture_output=True,
            text=True
        )
        # Look for Electron or Code processes
        for line in result.stdout.splitlines():
            if 'Electron' in line or ('Code' in line and 'VTDecoder' not in line and 'VTEncoder' not in line):
                return True
        return False
    except Exception:
        return False


def stop_vscode() -> bool:
    """Stop VSCode gracefully, then forcefully if needed."""
    print("Stopping VSCode...")
    current_user = os.environ.get('USER', '')
    
    # Try graceful quit first
    try:
        subprocess.run(
            ["osascript", "-e", 'tell application "Visual Studio Code" to quit'],
            capture_output=True,
            timeout=5
        )
    except Exception:
        pass
    
    # Wait for graceful shutdown (max 5 seconds)
    for _ in range(10):
        if not is_vscode_running():
            print("✓ VSCode stopped gracefully")
            return True
        time.sleep(0.5)
    
    # Force kill if still running
    print("⚠ Force killing VSCode...")
    try:
        result = subprocess.run(
            ["ps", "-u", current_user, "-o", "pid,comm"],
            capture_output=True,
            text=True
        )
        for line in result.stdout.splitlines():
            if 'Electron' in line or ('Code' in line and 'VTDecoder' not in line and 'VTEncoder' not in line):
                parts = line.strip().split()
                if parts:
                    pid = parts[0]
                    print(f"  Killing PID {pid}")
                    subprocess.run(["kill", "-9", pid], capture_output=True)
    except Exception as e:
        print(f"⚠ Warning: Error during force kill: {e}")
    
    # Final verification (wait 1 second for processes to die)
    time.sleep(1)
    if is_vscode_running():
        print("✗ ERROR: Failed to stop VSCode")
        return False
    
    print("✓ VSCode stopped successfully")
    return True


def verify_vscode_stopped() -> bool:
    """Verify VSCode is completely stopped."""
    if is_vscode_running():
        print("✗ ERROR: VSCode is still running after multiple attempts")
        print("  Please close VSCode manually and try again")
        return False
    
    # Wait a moment for file handles to be released
    time.sleep(0.5)
    return True


def execute_sql(db_path: Path, sql: str) -> bool:
    """Execute SQL statement on the database and display results."""
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        # Execute the SQL
        cursor.execute(sql)
        
        # Determine if this is a SELECT or modification query
        sql_upper = sql.strip().upper()
        is_select = sql_upper.startswith('SELECT') or sql_upper.startswith('PRAGMA')
        
        if is_select:
            # Fetch and display results
            rows = cursor.fetchall()
            if not rows:
                print("\n✓ Query executed successfully (0 rows)")
            else:
                # Get column names
                col_names = [desc[0] for desc in cursor.description] if cursor.description else []
                
                print(f"\n✓ Query executed successfully ({len(rows)} row{'s' if len(rows) != 1 else ''})")
                print()
                
                # Print column headers
                if col_names:
                    print(" | ".join(col_names))
                    print("-" * (sum(len(name) for name in col_names) + len(col_names) * 3 - 3))
                
                # Print rows
                for row in rows:
                    print(" | ".join(str(val) if val is not None else "NULL" for val in row))
        else:
            # Modification query - commit and show affected rows
            conn.commit()
            affected = cursor.rowcount
            print(f"\n✓ Query executed successfully ({affected} row{'s' if affected != 1 else ''} affected)")
        
        conn.close()
        return True
        
    except sqlite3.Error as e:
        print(f"✗ ERROR: Database error: {e}")
        return False
    except Exception as e:
        print(f"✗ ERROR: Unexpected error: {e}")
        return False


def main():
    # Parse arguments
    parser = argparse.ArgumentParser(
        description='Edit VSCode state.vscdb database safely',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Query the database
  python3 edit_vscdb.py --sql "SELECT * FROM ItemTable LIMIT 10"
  
  # Update a value
  python3 edit_vscdb.py --sql "UPDATE ItemTable SET value = '{}' WHERE key = 'test'"
  
  # Use a custom database path
  python3 edit_vscdb.py --sql "SELECT * FROM ItemTable" --db ~/custom/state.vscdb
        """
    )
    parser.add_argument(
        '--sql',
        required=True,
        help='SQL statement to execute'
    )
    parser.add_argument(
        '--db',
        default=str(DEFAULT_VSCODE_STATE_DB),
        help=f'Path to state.vscdb (default: {DEFAULT_VSCODE_STATE_DB})'
    )
    
    args = parser.parse_args()
    
    # Resolve database path
    db_path = Path(args.db).expanduser().resolve()
    
    print("=" * 70)
    print("VSCode state.vscdb Database Editor")
    print("=" * 70)
    print()
    print(f"Database: {db_path}")
    print(f"SQL: {args.sql}")
    print()
    
    # Step 1: Verify database exists
    if not db_path.exists():
        print(f"✗ ERROR: Database not found at {db_path}")
        sys.exit(1)
    
    # Step 2: Stop VSCode if running
    if is_vscode_running():
        if not stop_vscode():
            print("\n✗ Failed to stop VSCode. Please close it manually and try again.")
            sys.exit(1)
    else:
        print("✓ VSCode is not running")
    
    print()
    
    # Step 3: Verify VSCode is completely stopped
    if not verify_vscode_stopped():
        print("\n✗ ABORT: VSCode is still running after shutdown attempts")
        sys.exit(1)
    
    # Step 4: Execute SQL
    print("-" * 70)
    if not execute_sql(db_path, args.sql):
        print("\n✗ Failed to execute SQL")
        sys.exit(1)
    
    print()
    print("=" * 70)
    print("✓ SUCCESS! Database operation completed.")
    print("  You can now start VSCode if needed.")
    print("=" * 70)


if __name__ == "__main__":
    main()
