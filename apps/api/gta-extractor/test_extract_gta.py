import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _run(args):
    return subprocess.run(
        [sys.executable, str(HERE / "extract_gta.py"), *args],
        capture_output=True, text=True,
    )


def test_missing_arg_exits_2():
    result = _run([])
    assert result.returncode == 2
    assert "usage" in result.stderr.lower()


def test_missing_file_exits_2():
    result = _run([str(HERE / "does-not-exist.pdf")])
    assert result.returncode == 2
    assert "not found" in result.stderr.lower()
