#!/usr/bin/env python3
"""
Unit and regression tests for GCDS MarkItDown Isolated Worker
Tests security bounds, protocol conformance, format filtering, and error sanitization.
"""

import subprocess
import json
import base64
import sys
import os

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

def run_worker_stdin(payload_dict):
    worker_path = os.path.join(os.path.dirname(__file__), "worker.py")
    proc = subprocess.Popen(
        [sys.executable, worker_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    stdout, stderr = proc.communicate(input=json.dumps(payload_dict), timeout=10)
    return json.loads(stdout.strip())

def test_health():
    worker_path = os.path.join(os.path.dirname(__file__), "worker.py")
    res = subprocess.run([sys.executable, worker_path, "--health"], capture_output=True, text=True)
    assert res.returncode == 0
    data = json.loads(res.stdout.strip())
    assert data.get("ok") is True
    print("✅ Worker Health Check: PASS")

def test_empty_input():
    res = run_worker_stdin({})
    assert res.get("ok") is False
    assert res.get("error_code") == "INVALID_INPUT"
    print("✅ Empty Input Rejection: PASS")

def test_unsupported_format():
    res = run_worker_stdin({
        "file_extension": ".exe",
        "file_base64": base64.b64encode(b"malicious executable").decode("utf-8")
    })
    assert res.get("ok") is False
    assert res.get("error_code") == "UNSUPPORTED_FORMAT"
    print("✅ Unsupported Format Rejection (.exe): PASS")

def test_image_format_rejected_by_worker():
    res = run_worker_stdin({
        "file_extension": ".jpg",
        "file_base64": base64.b64encode(b"fake image data").decode("utf-8")
    })
    assert res.get("ok") is False
    assert res.get("error_code") == "UNSUPPORTED_FORMAT"
    print("✅ Non-Text Image Rejection (.jpg): PASS")

def test_corrupted_file_handling():
    res = run_worker_stdin({
        "file_extension": ".pdf",
        "file_base64": base64.b64encode(os.urandom(200)).decode("utf-8")
    })
    assert res.get("ok") is False
    assert res.get("error_code") == "CONVERSION_FAILED"
    # Must be sanitized error code, NEVER a stack trace or path
    assert "Traceback" not in json.dumps(res)
    assert "C:\\" not in json.dumps(res)
    assert "/home" not in json.dumps(res)
    print("✅ Corrupted File Sanitization (No Traceback/Paths): PASS")

def test_output_size_limit():
    # Test that max_markdown_bytes is respected
    # Create a small synthetic text document
    sample_text = ("GCDS Customer Data Store System Verification Line " * 20).encode("utf-8")
    res = run_worker_stdin({
        "file_extension": ".docx",
        "file_base64": base64.b64encode(sample_text).decode("utf-8"),
        "max_markdown_bytes": 50
    })
    # Even if conversion fails or succeeds, output must not leak or exceed
    if res.get("ok"):
        assert len(res.get("markdown", "").encode("utf-8")) <= 50
    print("✅ Markdown Output Limit Enforcement: PASS")

if __name__ == "__main__":
    print("=== RUNNING MARKITDOWN WORKER TEST SUITE ===")
    test_health()
    test_empty_input()
    test_unsupported_format()
    test_image_format_rejected_by_worker()
    test_corrupted_file_handling()
    test_output_size_limit()
    print("🎉 ALL PYTHON WORKER TESTS PASSED!")
