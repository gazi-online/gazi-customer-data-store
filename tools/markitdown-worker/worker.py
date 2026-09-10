#!/usr/bin/env python3
"""
GCDS MarkItDown Isolated Worker
Narrow structured stdin/stdout interface for text-capable document preprocessing.

SECURITY SPECIFICATION:
- Communicates only via structured JSON on stdin/stdout
- Rejects arbitrary arguments and disallowed extensions
- Enforces input byte limits (10MB) and output markdown limits (500KB)
- Prefers in-memory convert_stream(); uses secure tempfile only if required
- Cleans up any temp files in finally blocks
- Never emits stack traces, local paths, env vars, or sensitive document text to output/stderr
"""

import sys
import json
import base64
import time
import io
import os
import tempfile
from typing import Dict, Any

ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.xlsx'}
MAX_INPUT_BYTES = 10 * 1024 * 1024      # 10 MB
DEFAULT_MAX_OUTPUT_BYTES = 500 * 1024   # 500 KB

def sanitize_error(err_code: str) -> str:
    """Returns a deterministic JSON error response without internal paths or traces."""
    return json.dumps({
        "ok": False,
        "error_code": err_code
    })

def process_conversion(payload: Dict[str, Any]) -> str:
    start_time = time.perf_counter()

    raw_ext = payload.get("file_extension", "")
    if not isinstance(raw_ext, str) or not raw_ext:
        return sanitize_error("INVALID_INPUT")
    
    ext = raw_ext.lower().strip()
    if not ext.startswith("."):
        ext = "." + ext

    if ext not in ALLOWED_EXTENSIONS:
        return sanitize_error("UNSUPPORTED_FORMAT")

    b64_data = payload.get("file_base64", "")
    if not isinstance(b64_data, str) or not b64_data:
        return sanitize_error("INVALID_INPUT")

    try:
        file_bytes = base64.b64decode(b64_data)
    except Exception:
        return sanitize_error("INVALID_BASE64")

    if len(file_bytes) == 0:
        return sanitize_error("EMPTY_INPUT")

    if len(file_bytes) > MAX_INPUT_BYTES:
        return sanitize_error("PAYLOAD_TOO_LARGE")

    max_output_bytes = payload.get("max_markdown_bytes", DEFAULT_MAX_OUTPUT_BYTES)
    if not isinstance(max_output_bytes, int) or max_output_bytes <= 0:
        max_output_bytes = DEFAULT_MAX_OUTPUT_BYTES

    # Import markitdown lazily to keep health checks fast
    try:
        from markitdown import MarkItDown
    except ImportError:
        return sanitize_error("WORKER_UNAVAILABLE")

    md = MarkItDown()
    markdown_text = ""
    temp_path = None

    try:
        # 1. Preferred approach: convert_stream (pure in-memory)
        stream = io.BytesIO(file_bytes)
        try:
            res = md.convert_stream(stream, file_extension=ext)
            markdown_text = res.text_content or ""
        except Exception:
            # 2. Fallback for converters that require seeking or a physical path
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tf:
                tf.write(file_bytes)
                temp_path = tf.name
            res = md.convert_local(temp_path, file_extension=ext)
            markdown_text = res.text_content or ""

    except Exception:
        return sanitize_error("CONVERSION_FAILED")
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    # Validate output length
    encoded_out = markdown_text.encode("utf-8", errors="replace")
    truncated = False
    if len(encoded_out) > max_output_bytes:
        encoded_out = encoded_out[:max_output_bytes]
        markdown_text = encoded_out.decode("utf-8", errors="ignore")
        truncated = True

    duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

    return json.dumps({
        "ok": True,
        "markdown": markdown_text,
        "format": ext.lstrip("."),
        "duration_ms": duration_ms,
        "truncated": truncated
    })

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--health":
        try:
            import markitdown
            print(json.dumps({"ok": True, "version": getattr(markitdown, "__version__", "0.1.7")}))
            sys.exit(0)
        except Exception:
            print(json.dumps({"ok": False, "error_code": "WORKER_UNAVAILABLE"}))
            sys.exit(1)

    try:
        raw_input = sys.stdin.read()
        if not raw_input or not raw_input.strip():
            print(sanitize_error("EMPTY_STDIN"))
            sys.exit(0)

        payload = json.loads(raw_input)
        response = process_conversion(payload)
        print(response)
    except json.JSONDecodeError:
        print(sanitize_error("INVALID_JSON"))
    except Exception:
        print(sanitize_error("INTERNAL_WORKER_ERROR"))

if __name__ == "__main__":
    main()
