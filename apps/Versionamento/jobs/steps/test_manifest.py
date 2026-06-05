import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from steps.manifest import get_prev_fingerprint


class ManifestTest(unittest.TestCase):
    def test_failed_manifest_returns_only_retained_previous_fingerprint(self):
        manifest = {
            "status": "failed",
            "datasets": [
                {
                    "dataset_code": "FAILED_DATASET",
                    "fingerprint": "old-fp",
                    "fingerprint_status": "previous_retained_after_failure",
                },
                {
                    "dataset_code": "UNSAFE_DATASET",
                    "fingerprint": "current-fp",
                },
            ],
        }

        self.assertEqual(get_prev_fingerprint(manifest, "FAILED_DATASET"), "old-fp")
        self.assertIsNone(get_prev_fingerprint(manifest, "UNSAFE_DATASET"))


if __name__ == "__main__":
    unittest.main()
