from __future__ import annotations

import re
from dataclasses import dataclass

from gta_extractor.schema import WordBox


@dataclass(slots=True)
class LineBox:
    text: str
    words: list[WordBox]
    bbox: tuple[float, float, float, float]
    y_center: float


def group_words_into_lines(words: list[WordBox], y_tolerance: float = 4.0) -> list[LineBox]:
    rows: list[list[WordBox]] = []
    for word in sorted(words, key=lambda item: ((item.y0 + item.y1) / 2, item.x0)):
        y_center = (word.y0 + word.y1) / 2
        for row in rows:
            row_center = sum((item.y0 + item.y1) / 2 for item in row) / len(row)
            if abs(row_center - y_center) <= y_tolerance:
                row.append(word)
                break
        else:
            rows.append([word])
    return [_line(row) for row in rows]


def find_label(lines: list[LineBox], label_patterns: list[str]) -> LineBox | None:
    for line in lines:
        if any(re.search(pattern, line.text, flags=re.I) for pattern in label_patterns):
            return line
    return None


def read_value_right_of_label(line: LineBox, label: str) -> str:
    pattern = rf"{re.escape(label)}\s*:?\s*(.*)"
    match = re.search(pattern, line.text, flags=re.I)
    return re.sub(r"\s+", " ", match.group(1)).strip() if match else ""


def split_two_columns_by_anchors(
    words: list[WordBox],
    left_anchor: str = r"ORIGEM|PROCED[ÊE]NCIA",
    right_anchor: str = r"DESTINO",
) -> tuple[list[WordBox], list[WordBox]]:
    left_hits = [word for word in words if re.search(left_anchor, word.text, flags=re.I)]
    right_hits = [word for word in words if re.search(right_anchor, word.text, flags=re.I)]
    if right_hits:
        split_x = min(word.x0 for word in right_hits)
    else:
        split_x = (min(word.x0 for word in words) + max(word.x1 for word in words)) / 2 if words else 0
    left = [word for word in words if (word.x0 + word.x1) / 2 < split_x]
    right = [word for word in words if (word.x0 + word.x1) / 2 >= split_x]
    return left, right


def _line(words: list[WordBox]) -> LineBox:
    ordered = sorted(words, key=lambda item: item.x0)
    x0 = min(word.x0 for word in ordered)
    y0 = min(word.y0 for word in ordered)
    x1 = max(word.x1 for word in ordered)
    y1 = max(word.y1 for word in ordered)
    return LineBox(
        text=" ".join(word.text for word in ordered),
        words=ordered,
        bbox=(x0, y0, x1, y1),
        y_center=(y0 + y1) / 2,
    )
