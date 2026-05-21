import argparse
import asyncio
from pathlib import Path

from function_app import _render_pdf


async def main() -> None:
    parser = argparse.ArgumentParser(description="Render a LandWatch PDF locally without uploading to Blob Storage.")
    parser.add_argument("public_url", help="Public analysis URL to render")
    parser.add_argument(
        "--output",
        default="debug-analysis.pdf",
        help="PDF output path",
    )
    args = parser.parse_args()

    pdf = await _render_pdf(args.public_url)
    output = Path(args.output)
    output.write_bytes(pdf)
    print(f"Wrote {output.resolve()} ({len(pdf)} bytes)")


if __name__ == "__main__":
    asyncio.run(main())
