from __future__ import annotations

import re


DATE = r"(\d{2}/\d{2}/\d{4})"


def extract_sidago_emission_date(text: str) -> str:
    return _first(
        [
            rf"Data/Hora\s+Emiss[aã]o\s*:?\s*{DATE}",
            rf"Data\s+Emiss[aã]o\s*:?\s*{DATE}",
        ],
        text,
    ) or extract_sidago_noisy_emission_date(text)


def extract_sidago_noisy_emission_date(text: str) -> str:
    label = re.search(r"Data\s*[/ilrt]?\s*Hora\s+Emiss[aã]o\s*:?", text or "", flags=re.I)
    if not label:
        return ""
    window = (text or "")[label.end() : label.end() + 120]
    patterns = [
        r"(\d{2})\s*[tT/\\|lI]\s*([0-9OoIlA]{2,4})\s*[tT/\\|lI]\s*(1?\d{4})",
        r"(\d{2})\s+([0-9OoIlA]{2,4})\s+(1?\d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, window)
        if not match:
            continue
        date = _clean_noisy_date_parts(match.group(1), match.group(2), match.group(3))
        if date:
            return date
    compact = window[:40].translate(str.maketrans({"O": "0", "o": "0", "A": "0"}))
    digits = re.sub(r"\D", "", compact)
    return _date_from_digit_run(digits)


def extract_adapec_emission_date(text: str) -> str:
    return _first(
        [
            rf"Data/Hora\s+Emiss[aã]o\s*:?\s*{DATE}",
            rf"Data\s*/\s*Hora\s+Emiss[aã]o\s*:?\s*{DATE}",
            rf"Data\s+Emiss[aã]o\s*:?\s*{DATE}",
        ],
        text,
    )


def extract_gedave_emission_date(text: str) -> str:
    match = re.search(r"EMISS[AÃ]O.{0,600}?Data\s*:?\s*" + DATE, text, flags=re.I | re.S)
    if match:
        return match.group(1)
    return _first([rf"Emiss[aã]o.{0,120}?Data\s*:?\s*{DATE}"], text)


def _first(patterns: list[str], text: str) -> str:
    for pattern in patterns:
        match = re.search(pattern, text or "", flags=re.I | re.S)
        if match:
            return match.group(1)
    return ""


def _clean_noisy_date_parts(day: str, month: str, year: str) -> str:
    day_digits = re.sub(r"\D", "", day)
    month_text = month.translate(str.maketrans({"O": "0", "o": "0", "A": "0"}))
    month_digits = re.sub(r"\D", "", month_text)
    if len(month_digits) > 2:
        month_digits = month_digits[-2:]
    year_digits = re.sub(r"\D", "", year)
    if len(year_digits) > 4:
        year_digits = year_digits[-4:]
    return _valid_date(day_digits, month_digits, year_digits)


def _date_from_digit_run(digits: str) -> str:
    if len(digits) < 8:
        return ""
    day = digits[:2]
    year = digits[-4:]
    middle = digits[2:-4]
    candidates = []
    for start in range(0, max(0, len(middle) - 1)):
        month = middle[start : start + 2]
        date = _valid_date(day, month, year)
        if date:
            candidates.append(date)
    for date in candidates:
        if date[3:5] == "01":
            return date
    if candidates:
        return candidates[0]
    return ""


def _valid_date(day: str, month: str, year: str) -> str:
    if not (len(day) == 2 and len(month) == 2 and len(year) == 4):
        return ""
    d, m, y = int(day), int(month), int(year)
    if 1 <= d <= 31 and 1 <= m <= 12 and 2020 <= y <= 2030:
        return f"{d:02d}/{m:02d}/{y:04d}"
    return ""
