import json
import os
from datetime import datetime, timedelta, timezone

import azure.functions as func
from azure.core.exceptions import ResourceNotFoundError
from azure.storage.blob import BlobServiceClient, BlobSasPermissions, ContentSettings, generate_blob_sas
from playwright.async_api import async_playwright

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

def _env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing env var: {name}")
    return value

def _blob_service() -> BlobServiceClient:
    conn = _env("BLOB_CONNECTION_STRING")
    return BlobServiceClient.from_connection_string(conn)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "y", "sim"}


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default

def _conn_parts(conn: str) -> dict:
    parts = {}
    for item in conn.split(";"):
        if "=" in item:
            k, v = item.split("=", 1)
            parts[k] = v
    return parts

def _build_sas_url(container: str, blob_name: str) -> str:
    conn = _env("BLOB_CONNECTION_STRING")
    parts = _conn_parts(conn)
    account_name = parts.get("AccountName")
    account_key = parts.get("AccountKey")
    if not account_name or not account_key:
        raise RuntimeError("BLOB_CONNECTION_STRING must contain AccountName and AccountKey")
    sas = generate_blob_sas(
        account_name=account_name,
        container_name=container,
        blob_name=blob_name,
        account_key=account_key,
        permission=BlobSasPermissions(read=True),
        expiry=datetime.now(timezone.utc) + timedelta(minutes=15),
    )
    return f"https://{account_name}.blob.core.windows.net/{container}/{blob_name}?{sas}"

async def _render_pdf(public_url: str) -> bytes:
    nav_timeout_ms = int(os.getenv("PLAYWRIGHT_NAV_TIMEOUT_MS", "120000"))
    extra_wait_ms = int(os.getenv("PLAYWRIGHT_EXTRA_WAIT_MS", "2500"))
    margin_top = os.getenv("PLAYWRIGHT_MARGIN_TOP", "0mm")
    margin_right = os.getenv("PLAYWRIGHT_MARGIN_RIGHT", "0mm")
    margin_bottom = os.getenv("PLAYWRIGHT_MARGIN_BOTTOM", "0mm")
    margin_left = os.getenv("PLAYWRIGHT_MARGIN_LEFT", "0mm")
    pdf_scale = _env_float("PLAYWRIGHT_PDF_SCALE", 1.0)
    force_print_media = _env_bool("PLAYWRIGHT_FORCE_PRINT_MEDIA", True)
    wait_fonts = _env_bool("PLAYWRIGHT_WAIT_FOR_FONTS", True)
    dispatch_beforeprint = _env_bool("PLAYWRIGHT_DISPATCH_BEFOREPRINT", True)
    require_public_route = _env_bool("PLAYWRIGHT_REQUIRE_PUBLIC_ROUTE", True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = await browser.new_context(
            ignore_https_errors=True,
            viewport={"width": 1600, "height": 2200},
        )
        page = await context.new_page()
        await page.goto(public_url, wait_until="domcontentloaded", timeout=nav_timeout_ms)

        final_url = page.url.lower()
        if require_public_route and "/login" in final_url:
            await browser.close()
            raise RuntimeError(
                "A rota /public redirecionou para login. "
                f"URL final: {page.url}"
            )

        try:
            await page.wait_for_load_state("networkidle", timeout=nav_timeout_ms)
        except Exception:
            pass

        if force_print_media:
            try:
                await page.emulate_media(media="print")
            except Exception:
                pass

        # Aguarda o container principal da página de impressão quando disponível.
        try:
            await page.wait_for_selector(".analysis-print-page", timeout=15000)
        except Exception:
            pass

        if wait_fonts:
            try:
                await page.wait_for_function(
                    "document.fonts && document.fonts.status === 'loaded'",
                    timeout=30000,
                )
            except Exception:
                pass

        if dispatch_beforeprint:
            try:
                await page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
            except Exception:
                pass

        await page.wait_for_timeout(extra_wait_ms)
        pdf_bytes = await page.pdf(
            format="A4",
            print_background=True,
            prefer_css_page_size=True,
            scale=pdf_scale,
            margin={
                "top": margin_top,
                "right": margin_right,
                "bottom": margin_bottom,
                "left": margin_left,
            },
        )
        await browser.close()
        return pdf_bytes

@app.route(route="render-analysis-pdf", methods=["POST"])
async def render_analysis_pdf(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
        analysis_id = str(body.get("analysis_id", "")).strip()
        if not analysis_id:
            return func.HttpResponse("analysis_id is required", status_code=400)

        web_base = os.getenv("LANDWATCH_WEB_BASE_URL", "https://landwatch.sigfarmintelligence.com").rstrip("/")
        public_url = str(body.get("public_url") or f"{web_base}/analyses/{analysis_id}/public").strip()
        container = _env("BLOB_CONTAINER")

        pdf_bytes = await _render_pdf(public_url)

        blob_name = f"{analysis_id}.pdf"
        blob_client = _blob_service().get_blob_client(container=container, blob=blob_name)
        blob_client.upload_blob(
            pdf_bytes,
            overwrite=True,
            content_settings=ContentSettings(content_type="application/pdf"),
        )

        download_url = _build_sas_url(container, blob_name)

        payload = {
            "ok": True,
            "analysis_id": analysis_id,
            "container": container,
            "blobs": [blob_name],
            "blob_name": blob_name,
            "download_url": download_url,
            "cleanup_url": os.getenv("CLEANUP_URL", "").strip(),
        }
        return func.HttpResponse(
            json.dumps(payload, ensure_ascii=False),
            status_code=200,
            mimetype="application/json",
        )
    except Exception as e:
        return func.HttpResponse(
            json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False),
            status_code=500,
            mimetype="application/json",
        )

@app.route(route="cleanup-analysis-pdf", methods=["POST"])
def cleanup_analysis_pdf(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
        analysis_id = str(body.get("analysis_id", "")).strip()
        blob_name = str(body.get("blob_name", "")).strip() or (f"{analysis_id}.pdf" if analysis_id else "")
        if not blob_name:
            return func.HttpResponse("blob_name or analysis_id is required", status_code=400)

        container = _env("BLOB_CONTAINER")
        blob_client = _blob_service().get_blob_client(container=container, blob=blob_name)

        try:
            blob_client.delete_blob(delete_snapshots="include")
        except ResourceNotFoundError:
            pass

        return func.HttpResponse(
            json.dumps({"ok": True, "blob_name": blob_name}, ensure_ascii=False),
            status_code=200,
            mimetype="application/json",
        )
    except Exception as e:
        return func.HttpResponse(
            json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False),
            status_code=500,
            mimetype="application/json",
        )
