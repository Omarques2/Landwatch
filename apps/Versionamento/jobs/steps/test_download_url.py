import io
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jobs.steps.download_url import process_download_item


class _FakeResponse:
    status_code = 200
    headers = {"content-type": "application/zip"}


class DownloadUrlZipTest(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = Path(tempfile.mkdtemp(prefix="download_url_test_"))
        self.addCleanup(lambda: shutil.rmtree(self.tmp_dir, ignore_errors=True))

    def _build_zip_bytes(self) -> bytes:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for stem in ["cnuc_2025_08", "cnuc_2025_08_pontos"]:
                for ext in [".shp", ".dbf", ".shx", ".prj", ".cpg"]:
                    zf.writestr(f"{stem}{ext}", f"{stem}{ext}".encode("utf-8"))
        return buffer.getvalue()

    def test_keeps_member_names_when_zip_has_multiple_shp_stems(self):
        payload = self._build_zip_bytes()
        item = {
            "url": "https://example.com/ucs.zip",
            "path": "UCS",
            "filename": "UCS_CNUC",
        }

        with patch("jobs.steps.download_url.download_content", return_value=(_FakeResponse(), payload)):
            saved = process_download_item(item, self.tmp_dir)

        names = sorted(p.name for p in saved)
        self.assertIn("cnuc_2025_08.shp", names)
        self.assertIn("cnuc_2025_08_pontos.shp", names)
        self.assertNotIn("UCS_CNUC.shp", names)

    def test_filters_stem_and_renames_when_single_shp_family_selected(self):
        payload = self._build_zip_bytes()
        item = {
            "url": "https://example.com/ucs.zip",
            "path": "UCS",
            "filename": "UCS_CNUC",
            "zip_shp_stems": ["cnuc_2025_08"],
        }

        with patch("jobs.steps.download_url.download_content", return_value=(_FakeResponse(), payload)):
            saved = process_download_item(item, self.tmp_dir)

        names = sorted(p.name for p in saved)
        self.assertIn("UCS_CNUC.shp", names)
        self.assertIn("UCS_CNUC.dbf", names)
        self.assertNotIn("cnuc_2025_08_pontos.shp", names)
        self.assertNotIn("cnuc_2025_08.shp", names)


if __name__ == "__main__":
    unittest.main()

