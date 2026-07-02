from __future__ import annotations

import re
import unicodedata


def normalize(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower()
    return re.sub(r"\s+", " ", ascii_text).strip()


def normalize_keep_case(text: str) -> str:
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")


def only_digits(text: str) -> str:
    return re.sub(r"\D+", "", text or "")


def compact(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip(" :|\t\r\n")


def first(pattern: str, text: str, flags: int = re.I | re.S) -> str:
    match = re.search(pattern, text or "", flags)
    return match.group(1).strip() if match else ""


def split_city_uf(text: str) -> tuple[str, str]:
    match = re.search(r"(.+?)\s*/\s*([A-Za-z]{2})\b", text or "")
    if not match:
        return compact(text), ""
    return compact(match.group(1)), match.group(2).upper()

