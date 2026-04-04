#!/usr/bin/env python3
"""
Integration test for daemon architecture.

This script tests the following scenarios:
1. Start daemon
2. Simulate multiple extension hosts
3. Send JSON-RPC requests to daemon
4. Verify routing works correctly
"""

import json
import socket
import time
import os
import subprocess
import sys
from pathlib import Path


class IPCClient:
    def __init__(self, socket_path):
        self.socket_path = socket_path
    
    def send(self, message):
        """Send a message and receive a response."""
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            sock.connect(self.socket_path)
            sock.sendall((json.dumps(message) + '\n').encode('utf-8'))
            
            response_data = b''
            while True:
                chunk = sock.recv(1024)
                if not chunk:
                    break
                response_data += chunk
                if b'\n' in response_data:
                    break
            
            response = response_data.decode('utf-8').strip()
            return json.loads(response)
        finally:
            sock.close()


def cleanup_sockets():
    """Remove stale sockets."""
    vcc_dir = Path.home() / '.multi-vscode'
    if vcc_dir.exists():
        for sock in vcc_dir.glob('*.sock'):
            sock.unlink()


def start_daemon(daemon_path):
    """Start the daemon process."""
    print("Starting daemon...")
    proc = subprocess.Popen(
        ['node', daemon_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(1)  # Wait for daemon to start
    return proc


def test_daemon():
    """Run integration tests."""
    repo_root = Path(__file__).parent.parent
    daemon_path = repo_root / 'packages' / 'daemon' / 'dist' / 'index.js'
    daemon_socket = Path.home() / '.multi-vscode' / 'daemon.sock'
    
    if not daemon_path.exists():
        print(f"Error: Daemon not found at {daemon_path}")
        print("Please run 'npm run build' in packages/daemon first.")
        return 1
    
    cleanup_sockets()
    
    daemon_proc = None
    try:
        daemon_proc = start_daemon(daemon_path)
        
        # Wait for socket to be created
        for _ in range(10):
            if daemon_socket.exists():
                break
            time.sleep(0.5)
        else:
            print("Error: Daemon socket not created")
            return 1
        
        client = IPCClient(str(daemon_socket))
        
        # Test 1: Register extension host (should fail - no host yet)
        print("\nTest 1: Sending JSON-RPC without registered hosts...")
        response = client.send({
            'jsonrpc': '2.0',
            'method': 'ping',
            'id': 1,
        })
        print(f"Response: {response}")
        assert 'error' in response
        assert response['error']['code'] == -32603
        print("✓ Correctly returned error for no available hosts")
        
        # Test 2: Register a mock extension host
        print("\nTest 2: Registering extension host...")
        response = client.send({
            'type': 'register',
            'extensionId': 'test-ext-1',
            'socketPath': '/tmp/test-ext.sock',
        })
        print(f"Response: {response}")
        assert response['type'] == 'register-ack'
        assert response['success'] is True
        print("✓ Successfully registered extension host")
        
        # Test 3: Unregister extension host
        print("\nTest 3: Unregistering extension host...")
        response = client.send({
            'type': 'unregister',
            'extensionId': 'test-ext-1',
        })
        print(f"Response: {response}")
        assert response['type'] == 'unregister-ack'
        assert response['success'] is True
        print("✓ Successfully unregistered extension host")
        
        print("\n✓ All tests passed!")
        return 0
        
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        if daemon_proc:
            daemon_proc.terminate()
            daemon_proc.wait()
        cleanup_sockets()


if __name__ == '__main__':
    sys.exit(test_daemon())
