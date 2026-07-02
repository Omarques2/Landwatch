from __future__ import annotations

import re

from gta_extractor.schema import GTAGroup, PageExtraction


def group_pages_into_gtas(pages: list[PageExtraction]) -> list[GTAGroup]:
    groups: list[GTAGroup] = []
    current: GTAGroup | None = None
    record_index = 0

    for page in pages:
        if page.page_type == "gta_main":
            if current:
                groups.append(current)
            current = GTAGroup(
                arquivo=page.arquivo,
                record_index=record_index,
                pages=[page],
                main_page_index=page.page_index,
                sistema=page.sistema,
                numero_gta=page.numero_gta_candidate,
                serie_gta=page.serie_candidate,
                status="ok",
            )
            record_index += 1
            continue

        if page.page_type == "gta_continuation":
            if current and same_numero_serie(current, page):
                current.pages.append(page)
            else:
                groups.append(
                    GTAGroup(
                        arquivo=page.arquivo,
                        record_index=record_index,
                        pages=[page],
                        main_page_index=None,
                        sistema=page.sistema,
                        numero_gta=page.numero_gta_candidate,
                        serie_gta=page.serie_candidate,
                        status="needs_review",
                    )
                )
                record_index += 1
            continue

        if page.page_type == "unknown":
            if current and same_numero_serie(current, page):
                current.pages.append(page)
                if current.status == "ok":
                    current.status = "warning"
            elif not _has_strong_unresolved_gta_evidence(page):
                if current:
                    groups.append(current)
                    current = None
            else:
                if current:
                    groups.append(current)
                    current = None
                groups.append(
                    GTAGroup(
                        arquivo=page.arquivo,
                        record_index=record_index,
                        pages=[page],
                        main_page_index=None,
                        sistema=page.sistema,
                        numero_gta=page.numero_gta_candidate,
                        serie_gta=page.serie_candidate,
                        status="needs_review",
                    )
                )
                record_index += 1

    if current:
        groups.append(current)
    return groups


def _has_strong_unresolved_gta_evidence(page: PageExtraction) -> bool:
    if _looks_like_table_header_only_page(page.chosen_text or ""):
        return True
    if not page.numero_gta_candidate and not page.serie_candidate:
        return False
    text = page.chosen_text or ""
    return bool(page.sistema and ("GTA" in text.upper() or "TRÂNSITO" in text.upper() or "TRANSITO" in text.upper()))


def _looks_like_table_header_only_page(text: str) -> bool:
    compact = re.sub(r"\s+", "", text.lower())
    return all(token in compact for token in ["0-12", "13-24", "25-36"]) and "total" in compact


def same_numero_serie(group: GTAGroup, page: PageExtraction) -> bool:
    if not group.numero_gta or not page.numero_gta_candidate:
        return False
    if group.numero_gta != page.numero_gta_candidate:
        return False
    if group.serie_gta and page.serie_candidate and group.serie_gta != page.serie_candidate:
        return False
    return True
