import argparse
import json
import re
import unicodedata
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import geopandas as gpd
import pandas as pd
from pyproj import CRS
from shapely import make_valid
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon

try:
    from .common import ensure_dir, log_info, log_warn
except ImportError:  # suporte a execucao direta via `python prepare_ucs_novas_fontes.py`
    from common import ensure_dir, log_info, log_warn

warnings.filterwarnings(
    "ignore",
    message="invalid value encountered in make_valid",
    category=RuntimeWarning,
)

OUTPUT_DATASET_CODE = "UNIDADES_CONSERVACAO_NOVASFONTES"
OUTPUT_FILENAME = f"{OUTPUT_DATASET_CODE}.shp"
CURATED_CANDIDATES_RELATIVE_SHAPEFILE = Path("_comparativo_uc_report/AnaliseNovasUCs/NovasUCs.shp")

OUTPUT_COLUMNS = ["cnuc_code", "nome_uc", "categoria", "grupo", "esfera", "source", "geometry"]

ALWAYS_UC_SOURCES = (
    "10-siga.meioambiente.go.gov.br",
    "8-metadados.snirh.gov.br",
    "6-centrodametropole",
)

IBGE_SOURCE_MARKERS = ("7-geoftp.ibge.gov.br",)

# Seletores mais amplos para capturar "o que e ou pode ser UC" nas novas fontes.
UC_KEYWORD_PATTERNS = [
    re.compile(r"unidade(?:s)? de conserv", re.IGNORECASE),
    re.compile(r"\bparque\b", re.IGNORECASE),
    re.compile(r"\breserva\b", re.IGNORECASE),
    re.compile(r"esta[cç][aã]o ecol[oó]gica", re.IGNORECASE),
    re.compile(r"floresta nacional", re.IGNORECASE),
    re.compile(r"floresta estadual", re.IGNORECASE),
    re.compile(r"\bapa\b", re.IGNORECASE),
    re.compile(r"\barie\b", re.IGNORECASE),
    re.compile(r"\bresex\b", re.IGNORECASE),
    re.compile(r"\brevis\b", re.IGNORECASE),
    re.compile(r"\brppn\b", re.IGNORECASE),
    re.compile(r"monumento natural", re.IGNORECASE),
    re.compile(r"ref[uú]gio de vida silvestre", re.IGNORECASE),
    re.compile(r"reserva biol[oó]gica", re.IGNORECASE),
    re.compile(r"reserva de fauna", re.IGNORECASE),
    re.compile(r"reserva de desenvolvimento sustent[aá]vel", re.IGNORECASE),
    re.compile(r"[aá]rea de prote[cç][aã]o ambiental", re.IGNORECASE),
    re.compile(r"[aá]rea de relevante interesse ecol[oó]gic", re.IGNORECASE),
    re.compile(r"horto florestal", re.IGNORECASE),
    re.compile(r"estrada parque", re.IGNORECASE),
]

NAME_HINTS = ("nome", "name", "unidad", "titulo", "denomin")
CODE_HINTS = ("cnuc", "codigo", "cod", "id_uc", "iduc", "id_")
CATEGORY_HINTS = ("categoria", "categ", "classe", "classif", "grupo", "tipo", "descr", "legend", "texto", "text")
GROUP_HINTS = ("grupo",)
ESFERA_HINTS = ("esfera", "instancia", "esferaadmi", "esferaadm")

CATEGORY_RULES = [
    (re.compile(r"reserva particular do patrimonio natural|\brppn\b", re.IGNORECASE), "Reserva Particular do Patrimônio Natural"),
    (re.compile(r"reserva extrativista|\bresex\b", re.IGNORECASE), "Reserva Extrativista"),
    (re.compile(r"reserva de desenvolvimento sustent[aá]vel|\brds\b", re.IGNORECASE), "Reserva de Desenvolvimento Sustentável"),
    (re.compile(r"reserva biol[oó]gica|\brebio\b", re.IGNORECASE), "Reserva Biológica"),
    (re.compile(r"reserva de fauna", re.IGNORECASE), "Reserva de Fauna"),
    (re.compile(r"ref[uú]gio de vida silvestre|\brevis\b|\brvs\b", re.IGNORECASE), "Refúgio de Vida Silvestre"),
    (re.compile(r"monumento natural|\bmona\b", re.IGNORECASE), "Monumento Natural"),
    (re.compile(r"esta[cç][aã]o ecol[oó]gica|\besec\b", re.IGNORECASE), "Estação Ecológica"),
    (re.compile(r"[aá]rea de relevante interesse ecol[oó]gic|\barie\b", re.IGNORECASE), "Área de Relevante Interesse Ecológico"),
    (re.compile(r"[aá]rea de prote[cç][aã]o ambiental|\bapa\b", re.IGNORECASE), "Área de Proteção Ambiental"),
    (re.compile(r"reserva ecol[oó]gica", re.IGNORECASE), "Reserva Ecológica"),
    (re.compile(r"esta[cç][aã]o de pesquisa", re.IGNORECASE), "Estação de Pesquisa"),
    (re.compile(r"estrada parque", re.IGNORECASE), "Estrada Parque"),
    (re.compile(r"parque natural municipal", re.IGNORECASE), "Parque"),
    (re.compile(r"\bparque\b|\bparna\b", re.IGNORECASE), "Parque"),
    (re.compile(r"\bfloresta\b|\bflona\b", re.IGNORECASE), "Floresta"),
]

GROUP_BY_CATEGORY = {
    "Estação Ecológica": "PROTECAO INTEGRAL",
    "Monumento Natural": "PROTECAO INTEGRAL",
    "Parque": "PROTECAO INTEGRAL",
    "Refúgio de Vida Silvestre": "PROTECAO INTEGRAL",
    "Reserva Biológica": "PROTECAO INTEGRAL",
    "Área de Proteção Ambiental": "USO SUSTENTAVEL",
    "Área de Relevante Interesse Ecológico": "USO SUSTENTAVEL",
    "Floresta": "USO SUSTENTAVEL",
    "Reserva de Desenvolvimento Sustentável": "USO SUSTENTAVEL",
    "Reserva de Fauna": "USO SUSTENTAVEL",
    "Reserva Extrativista": "USO SUSTENTAVEL",
    "Reserva Particular do Patrimônio Natural": "USO SUSTENTAVEL",
    "Unidade de Conservação - Proteção Integral": "PROTECAO INTEGRAL",
    "Unidade de Conservação - Uso Sustentável": "USO SUSTENTAVEL",
    "Proteção Integral": "PROTECAO INTEGRAL",
}

IBGE_UC_CATEGORY_PATTERNS = [
    re.compile(r"\bparque\b", re.IGNORECASE),
    re.compile(r"\bparna\b", re.IGNORECASE),
    re.compile(r"\bfloresta\b", re.IGNORECASE),
    re.compile(r"\bflona\b", re.IGNORECASE),
    re.compile(r"\breserva\b", re.IGNORECASE),
    re.compile(r"\bresex\b", re.IGNORECASE),
    re.compile(r"\brebio\b", re.IGNORECASE),
    re.compile(r"\brppn\b", re.IGNORECASE),
    re.compile(r"\brds\b", re.IGNORECASE),
    re.compile(r"\bmona\b", re.IGNORECASE),
    re.compile(r"\brevis\b|\brvs\b", re.IGNORECASE),
    re.compile(r"\bapa\b", re.IGNORECASE),
    re.compile(r"\barie\b", re.IGNORECASE),
    re.compile(r"reserva ecol[oó]gica", re.IGNORECASE),
    re.compile(r"esta[cç][aã]o de pesquisa", re.IGNORECASE),
    re.compile(r"estrada parque", re.IGNORECASE),
    re.compile(r"parque natural municipal", re.IGNORECASE),
    re.compile(r"floresta nacional", re.IGNORECASE),
]

IBGE_UC_CLASS_PATTERNS = [
    re.compile(
        r"unidade(?:s)? de conserva\w*\s+de\s+prote[cç][aã]o integral",
        re.IGNORECASE,
    ),
    re.compile(
        r"unidade(?:s)? de conserva\w*\s+de\s+uso sustent[aá]vel",
        re.IGNORECASE,
    ),
]

CODE_LIKE_VALUE_RE = re.compile(r"^[A-Za-z]{0,5}_?\d+(?:\.\d+)+$")
LEADING_CODE_PREFIX_RE = re.compile(r"^[A-Za-z]{0,5}_?\d+(?:\.\d+)+(?:[_\-\s]+)")
UC_DESCRIPTION_RE = re.compile(r"\bunidade(?:s)? de conserva", re.IGNORECASE)
SOURCE_LABEL_LEADING_PREFIX_RE = re.compile(r"^(?:\d+_+|NOVASFONTES_+)+", re.IGNORECASE)
UC_CATEGORIA_PREFIX_RE = re.compile(
    r"^(?:"
    r"UC\s+de\s+Uso\s+Sustent[aá]vel\s*-\s*"
    r"|UC\s+de\s+Prote[cç][aã]o\s+Integral\s*-\s*"
    r"|Unidade\s+de\s+Conserva[cç][aã]o\s*-\s*Uso\s+Sustent[aá]vel\s*-\s*"
    r"|Unidade\s+de\s+Conserva[cç][aã]o\s*-\s*Prote[cç][aã]o\s+Integral\s*-\s*"
    r")",
    re.IGNORECASE,
)
UC_NOME_PREFIX_RE = re.compile(
    r"^(?:Unidade|Unidades)\s+de\s+Conserva[cç][aã]o\s+de\s*",
    re.IGNORECASE,
)
RPPN_NOME_RE = re.compile(
    r"RESERVA\s+PARTICULAR\s+DO\s+PATRIM[ÔO]NIO\s+NATURAL",
    re.IGNORECASE,
)


class PrepareNovasFontesUcsError(RuntimeError):
    pass


@dataclass
class SourceLayer:
    source_name: str
    shp_path: Path
    gdf: gpd.GeoDataFrame
    preselected_candidates: bool = False


@dataclass
class PrepareNovasFontesUcsResult:
    output_shp: Path
    output_files: List[Path]
    qa_report_path: Path
    metrics: Dict[str, int]


def _fix_mojibake(value: str) -> str:
    # Corrige strings tipicas UTF-8 lidas como latin1 (ex.: "Ã�rea").
    if "Ã" not in value and "Â" not in value:
        return value
    try:
        return value.encode("latin1").decode("utf-8")
    except Exception:
        return value


def _normalize_text(value) -> Optional[str]:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    if not text:
        return None
    text = _fix_mojibake(text)
    text = re.sub(r"\s+", " ", text)
    return text


def _compact_uc_categoria(value: Optional[str]) -> Optional[str]:
    text = _normalize_text(value)
    if not text:
        return None

    compacted = UC_CATEGORIA_PREFIX_RE.sub("", text).strip(" -")
    if compacted:
        return compacted

    norm = _normalize_for_match(text)
    if "uso sustentavel" in norm or "uso sutentavel" in norm:
        return "Uso Sustentável"
    if "protecao integral" in norm:
        return "Proteção Integral"
    return text


def _compact_uc_nome(value: Optional[str]) -> Optional[str]:
    text = _normalize_text(value)
    if not text:
        return None
    compacted = UC_NOME_PREFIX_RE.sub("", text).strip(" -")
    compacted = RPPN_NOME_RE.sub("RPPN", compacted).strip(" -")
    return compacted or text


def _normalize_code(value) -> Optional[str]:
    text = _normalize_text(value)
    if text is None:
        return None
    return text.upper().replace(" ", "")


def _normalize_for_match(value: str) -> str:
    t = _normalize_text(value) or ""
    t = t.lower()
    t = "".join(ch for ch in unicodedata.normalize("NFD", t) if unicodedata.category(ch) != "Mn")
    t = t.replace("\u0092", "'").replace("’", "'").replace("`", "'")
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _read_sidecar_crs(shp_path: Path) -> Optional[CRS]:
    candidates = [shp_path.with_suffix(".prj"), shp_path.with_suffix(".prj.txt")]
    for crs_path in candidates:
        if not crs_path.exists():
            continue
        try:
            wkt = crs_path.read_text(encoding="utf-8", errors="ignore").strip()
            if wkt:
                return CRS.from_wkt(wkt)
        except Exception:
            continue
    return None


def _looks_geographic_bounds(bounds: Sequence[float]) -> bool:
    minx, miny, maxx, maxy = [float(v) for v in bounds]
    return (
        -180.0 <= minx <= 180.0
        and -180.0 <= maxx <= 180.0
        and -90.0 <= miny <= 90.0
        and -90.0 <= maxy <= 90.0
    )


def _ensure_known_crs(gdf: gpd.GeoDataFrame, shp_path: Path) -> gpd.GeoDataFrame:
    out = gdf.copy()
    if out.crs is not None:
        return out
    sidecar = _read_sidecar_crs(shp_path)
    if sidecar is not None:
        try:
            return out.set_crs(sidecar, allow_override=True)
        except Exception:
            pass
    bounds = out.total_bounds if len(out) else (-180, -90, 180, 90)
    if _looks_geographic_bounds(bounds):
        return out.set_crs(4674, allow_override=True)
    # fallback conservador para dados projetados sem PRJ.
    return out.set_crs(5880, allow_override=True)


def _is_source_always_uc(source_name: str) -> bool:
    norm = _normalize_for_match(source_name)
    return any(_normalize_for_match(marker) in norm for marker in ALWAYS_UC_SOURCES)


def _is_ibge_source(source_name: str) -> bool:
    norm = _normalize_for_match(source_name)
    return any(_normalize_for_match(marker) in norm for marker in IBGE_SOURCE_MARKERS)


def _looks_like_text(series: pd.Series) -> bool:
    return bool(pd.api.types.is_object_dtype(series) or pd.api.types.is_string_dtype(series))


def _pick_columns(columns: Sequence[str], hints: Sequence[str]) -> List[str]:
    out: List[str] = []
    low = {c.lower(): c for c in columns}
    for col in columns:
        cname = col.lower()
        if any(h in cname for h in hints):
            out.append(low[cname])
    return out


def _is_metadata_text_column(column_name: str) -> bool:
    low = column_name.lower()
    patterns = (
        "source",
        "fonte",
        "src_",
        "srcshp",
        "intersec",
        "cov_",
        "iou",
        "uid",
        "new_rule",
        "code_match",
        "name_match",
        "rows_",
    )
    if any(p in low for p in patterns):
        return True
    if re.fullmatch(r"col\d+", low):
        return True
    return False


def _contains_uc_keyword(text: str) -> bool:
    if not text:
        return False
    return any(p.search(text) for p in UC_KEYWORD_PATTERNS)


def _contains_ibge_uc_keyword(text: str) -> bool:
    if not text:
        return False
    # Evita falsos positivos em classes compostas da base de uso/cobertura.
    if "+" in text:
        return any(p.search(text) for p in IBGE_UC_CATEGORY_PATTERNS)

    if any(p.search(text) for p in IBGE_UC_CATEGORY_PATTERNS):
        return True
    return any(p.search(text) for p in IBGE_UC_CLASS_PATTERNS)


def _first_non_empty(row: pd.Series, columns: Sequence[str]) -> Optional[str]:
    for col in columns:
        if col not in row:
            continue
        value = _normalize_text(row[col])
        if value:
            return value
    return None


def _has_alpha(text: Optional[str]) -> bool:
    if not text:
        return False
    return bool(re.search(r"[A-Za-zÀ-ÿ]", text))


def _is_code_like_value(text: Optional[str]) -> bool:
    if not text:
        return False
    value = _normalize_text(text) or ""
    value_norm = _normalize_for_match(value).replace(" ", "")
    return bool(CODE_LIKE_VALUE_RE.fullmatch(value_norm))


def _strip_leading_code_prefix(text: Optional[str]) -> Optional[str]:
    value = _normalize_text(text)
    if not value:
        return None
    cleaned = LEADING_CODE_PREFIX_RE.sub("", value).strip()
    return cleaned or value


def _is_descriptive_text(text: Optional[str]) -> bool:
    value = _normalize_text(text)
    if not value:
        return False
    if _is_code_like_value(value):
        return False
    norm = _normalize_for_match(value)
    if UC_DESCRIPTION_RE.search(norm):
        return True
    return len(value.split()) >= 4


def _to_title_case(text: str) -> str:
    words = text.split()
    if not words:
        return text
    low_words = {"de", "da", "do", "das", "dos", "e"}
    out: List[str] = []
    for idx, word in enumerate(words):
        lw = word.lower()
        if idx > 0 and lw in low_words:
            out.append(lw)
        else:
            out.append(lw.capitalize())
    return " ".join(out)


def _extract_tagged_value(text: Optional[str], tags: Sequence[str]) -> Optional[str]:
    raw = _normalize_text(text)
    if not raw:
        return None
    for tag in tags:
        pattern = re.compile(rf"(?:^|\|\s*){re.escape(tag)}\s*:\s*([^|]+)", re.IGNORECASE)
        match = pattern.search(raw)
        if match:
            value = _normalize_text(match.group(1))
            if value:
                return value
    return None


def _infer_uc_generic_category_by_area(search_norm: str) -> Optional[str]:
    if not search_norm:
        return None
    text = search_norm
    text = text.replace("d'agua", "dagua")
    text = text.replace("d água", "dagua")
    text = text.replace("d´agua", "dagua")
    text = text.replace("d`agua", "dagua")
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    is_uso = "uso sustentavel" in text or "uso sutentavel" in text
    is_protecao = "protecao integral" in text
    if not is_uso and not is_protecao:
        return None

    area_suffix = None
    if "area florestal" in text:
        area_suffix = "Área Florestal"
    elif "area campestre" in text:
        area_suffix = "Área Campestre"
    elif "corpo dagua continental" in text:
        area_suffix = "Corpo d'Água Continental"
    elif "corpo dagua costeiro" in text:
        area_suffix = "Corpo d'Água Costeiro"
    elif "area descoberta" in text:
        area_suffix = "Área Descoberta"

    if area_suffix:
        return area_suffix

    if is_uso:
        return "Uso Sustentável"
    return "Proteção Integral"


def _extract_best_descriptive_text(row: pd.Series, candidate_columns: Sequence[str]) -> Optional[str]:
    uc_candidates: List[str] = []
    generic_candidates: List[str] = []

    for col in candidate_columns:
        if col not in row:
            continue
        raw_value = _normalize_text(row.get(col))
        if not raw_value:
            continue
        value = _strip_leading_code_prefix(raw_value) or raw_value
        if not value:
            continue
        if _is_code_like_value(value):
            continue
        if UC_DESCRIPTION_RE.search(_normalize_for_match(value)):
            uc_candidates.append(value)
            continue
        if _is_descriptive_text(value):
            generic_candidates.append(value)

    if uc_candidates:
        return sorted(uc_candidates, key=lambda x: (-len(x), x))[0]
    if generic_candidates:
        return sorted(generic_candidates, key=lambda x: (-len(x), x))[0]
    return None


def _derive_custom_category(raw_category: Optional[str], raw_name: Optional[str], search_text: str) -> str:
    search_norm = _normalize_for_match(search_text)
    area_based = _infer_uc_generic_category_by_area(search_norm)
    if area_based:
        return area_based
    if "horto florestal" in search_norm:
        return "Horto Florestal"
    if "reserva ecologica" in search_norm:
        return "Reserva Ecológica"
    if "estacao de pesquisa" in search_norm:
        return "Estação de Pesquisa"
    if "estrada parque" in search_norm:
        return "Estrada Parque"
    if "praca" in search_norm:
        return "Praça"
    if "gruta" in search_norm:
        return "Gruta"

    candidates = [raw_name, raw_category]
    for candidate in candidates:
        if not candidate:
            continue
        clean = (_strip_leading_code_prefix(candidate) or candidate).strip()
        if not clean:
            continue
        # evita categorias numericas "3.2.1"
        if re.fullmatch(r"[0-9.\-_ ]+", clean):
            continue
        if _is_code_like_value(clean):
            continue
        if re.search(r"\.gov\.br|^[0-9]{1,3}-", clean.lower()):
            continue
        # usa os primeiros termos para evitar string gigante.
        tokens = clean.split()
        return _to_title_case(" ".join(tokens[:5]))
    return "Categoria Não Classificada"


def _canonicalize_category(raw_category: Optional[str], raw_name: Optional[str], text_blob: str) -> str:
    tagged_category = _extract_tagged_value(
        text_blob,
        [
            "CATEGORIA",
            "CATEGORI3",
            "CATEGORI",
            "CATEGORY",
            "CLASSIF",
        ],
    )
    search = " | ".join(filter(None, [tagged_category, raw_category, raw_name, text_blob]))
    search_norm = _normalize_for_match(search)
    area_based = _infer_uc_generic_category_by_area(search_norm)
    raw_category_norm = _normalize_for_match(raw_category or "")
    raw_name_norm = _normalize_for_match(raw_name or "")

    for pattern, canonical in CATEGORY_RULES:
        if pattern.search(search):
            return canonical

    if raw_category_norm in {"us", "uso sustentavel", "uso sustentavel - us"} or raw_name_norm == "us":
        return area_based or "Uso Sustentável"
    if raw_category_norm in {"pi", "protecao integral", "protecao integral - pi"} or raw_name_norm == "pi":
        return area_based or "Proteção Integral"
    if raw_category_norm.startswith("vpar"):
        if "parque" in raw_name_norm:
            return "Parque"
        if "praca" in raw_name_norm or "praca" in search_norm:
            return "Praça"
        return "Parque Urbano"

    if UC_DESCRIPTION_RE.search(search_norm):
        if area_based:
            return area_based
        if "protecao integral" in search_norm:
            return "Proteção Integral"
        if "uso sustentavel" in search_norm or "uso sutentavel" in search_norm:
            return "Uso Sustentável"

    return _derive_custom_category(raw_category, raw_name, search)


def _infer_group(category: str, raw_group: Optional[str], text_blob: str) -> str:
    mapped = GROUP_BY_CATEGORY.get(category)
    if mapped:
        return mapped

    category_norm = _normalize_for_match(category or "")
    if "protecao integral" in category_norm:
        return "PROTECAO INTEGRAL"
    if "uso sustentavel" in category_norm or "uso sutentavel" in category_norm:
        return "USO SUSTENTAVEL"

    raw = _normalize_for_match(raw_group or "")
    text = _normalize_for_match(text_blob)
    for candidate in (raw, text):
        if "protecao integral" in candidate or re.search(r"\bpi\b", candidate):
            return "PROTECAO INTEGRAL"
        if "uso sustentavel" in candidate or re.search(r"\bus\b", candidate):
            return "USO SUSTENTAVEL"

    return "NAO_CLASSIFICADO"


def _infer_esfera(raw_esfera: Optional[str], text_blob: str, source_name: str, shp_path: Path) -> str:
    search = " | ".join(
        filter(
            None,
            [
                _normalize_text(raw_esfera),
                _normalize_text(text_blob),
                _normalize_text(source_name),
                _normalize_text(str(shp_path.parent)),
            ],
        )
    )
    norm = _normalize_for_match(search)
    if "municip" in norm:
        return "MUNICIPAL"
    if "estadual" in norm:
        return "ESTADUAL"
    if "federal" in norm:
        return "FEDERAL"
    if "particular" in norm or "privad" in norm:
        return "PARTICULAR"
    return "NAO_INFORMADA"


def _source_label(source_name: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", source_name).strip("_").upper()
    slug = SOURCE_LABEL_LEADING_PREFIX_RE.sub("", slug).strip("_")
    return slug[:80] if slug else "NOVASFONTES"


def _safe_make_valid(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    def _polygonal_only(geom):
        if geom is None:
            return None
        if isinstance(geom, Polygon):
            return geom
        if isinstance(geom, MultiPolygon):
            return geom
        if isinstance(geom, GeometryCollection):
            polys = [g for g in geom.geoms if isinstance(g, (Polygon, MultiPolygon))]
            if not polys:
                return None
            if len(polys) == 1:
                return polys[0]
            parts: List[Polygon] = []
            for p in polys:
                if isinstance(p, Polygon):
                    parts.append(p)
                elif isinstance(p, MultiPolygon):
                    parts.extend(list(p.geoms))
            if not parts:
                return None
            return MultiPolygon(parts)
        return None

    out = gdf.copy()
    fixed = []
    for geom in out.geometry:
        if geom is None:
            fixed.append(geom)
            continue
        try:
            if geom.is_valid:
                fixed.append(geom)
            else:
                fixed.append(make_valid(geom))
        except Exception:
            try:
                fixed.append(geom.buffer(0))
            except Exception:
                fixed.append(geom)
    out.geometry = [_polygonal_only(g) for g in fixed]
    return out


def _build_row_text_blob(row: pd.Series, text_cols: Sequence[str]) -> str:
    parts: List[str] = []
    for col in text_cols:
        value = _normalize_text(row.get(col))
        if value:
            parts.append(value)
    return " | ".join(parts)


def _filter_candidate_rows(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    cols = [c for c in gdf.columns if c != gdf.geometry.name]
    text_cols = [c for c in cols if _looks_like_text(gdf[c])]
    if not text_cols:
        return gdf.iloc[0:0].copy()

    joined = gdf[text_cols].astype(str).agg(" | ".join, axis=1)
    mask = joined.map(_contains_uc_keyword)
    return gdf.loc[mask].copy()


def _filter_candidate_rows_by_source(gdf: gpd.GeoDataFrame, source_name: str) -> gpd.GeoDataFrame:
    if _is_source_always_uc(source_name):
        return gdf.copy()

    cols = [c for c in gdf.columns if c != gdf.geometry.name]
    text_cols = [c for c in cols if _looks_like_text(gdf[c])]
    if not text_cols:
        return gdf.iloc[0:0].copy()

    joined = gdf[text_cols].astype(str).agg(" | ".join, axis=1)
    if _is_ibge_source(source_name):
        mask = joined.map(_contains_ibge_uc_keyword)
    else:
        mask = joined.map(_contains_uc_keyword)
    return gdf.loc[mask].copy()


def _build_cnuc_code(
    used_codes: set[str],
    source_label: str,
    idx: int,
    source_code: Optional[str],
) -> str:
    code = _normalize_code(source_code) if source_code else None
    base: Optional[str] = None
    if code and re.fullmatch(r"\d{4}\.\d{2}\.\d{4}", code):
        base = code
    elif code:
        # Usa somente o ID encontrado no codigo de origem, sem metadado de fonte.
        if code.startswith("NF.") and "." in code:
            last_token = code.rsplit(".", 1)[-1]
            if re.search(r"\d", last_token):
                base = last_token
        numeric_tail = re.search(r"([0-9]+(?:\.[0-9]+)*)$", code)
        if numeric_tail:
            base = base or numeric_tail.group(1)
        else:
            alnum_tail = re.search(r"([A-Z0-9]*\d[A-Z0-9]*)$", code)
            if alnum_tail:
                base = base or alnum_tail.group(1)
            else:
                compact = re.sub(r"[^A-Z0-9.]+", "", code).strip(".")
                base = base or (compact[:40] if compact else None)

    if not base:
        # fallback sem informacao de fonte
        base = str(idx + 1)

    candidate = base
    suffix = 2
    while candidate in used_codes:
        candidate = f"{base}.{suffix}"
        suffix += 1
    used_codes.add(candidate)
    return candidate


def _validate_output(gdf: gpd.GeoDataFrame) -> None:
    if gdf.empty:
        raise PrepareNovasFontesUcsError("Output UCS NovasFontes vazio.")
    for col in ["cnuc_code", "nome_uc", "categoria", "grupo", "esfera", "source"]:
        if col not in gdf.columns:
            raise PrepareNovasFontesUcsError(f"Coluna obrigatoria ausente: {col}")
        null_or_blank = int(gdf[col].isna().sum() + (gdf[col].astype(str).str.strip() == "").sum())
        if null_or_blank:
            raise PrepareNovasFontesUcsError(f"Coluna {col} com {null_or_blank} valor(es) nulo(s)/vazio(s).")
    dup = int(gdf.duplicated(subset=["cnuc_code"]).sum())
    if dup:
        raise PrepareNovasFontesUcsError(f"cnuc_code duplicado: {dup}")
    null_geom = int(gdf.geometry.isna().sum())
    if null_geom:
        raise PrepareNovasFontesUcsError(f"Geometrias nulas: {null_geom}")


def _strong_spatial_match(
    incoming: gpd.GeoDataFrame,
    base: gpd.GeoDataFrame,
) -> pd.Series:
    if incoming.empty or base.empty:
        return pd.Series([False] * len(incoming), index=incoming.index)

    incoming_ea = _safe_make_valid(incoming.to_crs(5880)).reset_index(drop=False).rename(columns={"index": "_in_idx"})
    base_ea = _safe_make_valid(base.to_crs(5880)).reset_index(drop=False).rename(columns={"index": "_base_idx"})

    sj = gpd.sjoin(
        incoming_ea[["_in_idx", "geometry"]],
        base_ea[["_base_idx", "geometry"]],
        how="left",
        predicate="intersects",
    )
    if sj.empty:
        return pd.Series([False] * len(incoming), index=incoming.index)

    base_geom = base_ea.set_index("_base_idx")["geometry"]
    in_geom = incoming_ea.set_index("_in_idx")["geometry"]

    match_map: Dict[int, bool] = {}
    for idx, grp in sj.dropna(subset=["_base_idx"]).groupby("_in_idx"):
        g1 = in_geom.loc[idx]
        area1 = float(g1.area) if g1 is not None and not g1.is_empty else 0.0
        strong = False
        for bidx in grp["_base_idx"].astype(int).tolist():
            g2 = base_geom.loc[bidx]
            try:
                inter = g1.intersection(g2)
            except Exception:
                try:
                    inter = make_valid(g1).intersection(make_valid(g2))
                except Exception:
                    continue
            if inter.is_empty:
                continue
            inter_area = float(inter.area)
            union_area = float(g1.union(g2).area) if g1 is not None and g2 is not None else 0.0
            cover = inter_area / area1 if area1 > 0 else 0.0
            iou = inter_area / union_area if union_area > 0 else 0.0
            if cover >= 0.80 or iou >= 0.50:
                strong = True
                break
        match_map[int(idx)] = strong

    mask = incoming.reset_index().rename(columns={"index": "_orig_idx"})["_orig_idx"].map(
        lambda x: bool(match_map.get(int(x), False))
    )
    mask.index = incoming.index
    return mask


def _filter_existing_against_base(
    prepared: gpd.GeoDataFrame,
    base_ucs: gpd.GeoDataFrame,
) -> Tuple[gpd.GeoDataFrame, int]:
    if base_ucs.empty or prepared.empty:
        return prepared, 0

    base = base_ucs.copy()
    if base.crs and prepared.crs and base.crs != prepared.crs:
        base = base.to_crs(prepared.crs)

    base_code_col = next((c for c in base.columns if c.lower() == "cnuc_code"), None)
    base_name_col = next((c for c in base.columns if c.lower() == "nome_uc"), None)

    base_codes = set()
    if base_code_col:
        base_codes = set((_normalize_code(v) or "") for v in base[base_code_col].tolist())
        base_codes.discard("")

    base_names = set()
    if base_name_col:
        base_names = set((_normalize_for_match(v) or "") for v in base[base_name_col].tolist())
        base_names.discard("")

    code_match = prepared["cnuc_code"].map(lambda v: (_normalize_code(v) or "") in base_codes)
    name_match = prepared["nome_uc"].map(lambda v: (_normalize_for_match(v) or "") in base_names)
    spatial_match = _strong_spatial_match(prepared, base)

    keep_mask = ~(code_match | name_match | spatial_match)
    filtered = prepared.loc[keep_mask].copy()
    filtered_count = int((~keep_mask).sum())
    return filtered, filtered_count


def build_prepared_novas_fontes_ucs(
    source_layers: Iterable[SourceLayer],
    base_ucs: Optional[gpd.GeoDataFrame] = None,
) -> Tuple[gpd.GeoDataFrame, Dict[str, int]]:
    prepared_rows: List[dict] = []
    used_codes: set[str] = set()
    source_in = 0
    candidate_in = 0

    for layer in source_layers:
        source_in += 1
        gdf = layer.gdf.copy()
        if gdf.empty:
            continue
        gdf = _ensure_known_crs(gdf, layer.shp_path)
        gdf = gdf.to_crs(4674)
        gdf = _safe_make_valid(gdf)

        if layer.preselected_candidates:
            candidates = gdf.copy()
        else:
            candidates = _filter_candidate_rows_by_source(gdf, layer.source_name)
        if candidates.empty:
            continue
        candidate_in += int(len(candidates))

        cols = [c for c in candidates.columns if c != candidates.geometry.name]
        text_cols = [c for c in cols if _looks_like_text(candidates[c])]
        informative_text_cols = [c for c in text_cols if not _is_metadata_text_column(c)] or text_cols
        name_cols = _pick_columns(cols, NAME_HINTS) or informative_text_cols[:3]
        code_cols = _pick_columns(cols, CODE_HINTS)
        category_cols = _pick_columns(cols, CATEGORY_HINTS) or informative_text_cols[:3]
        group_cols = _pick_columns(cols, GROUP_HINTS) or category_cols
        esfera_cols = _pick_columns(cols, ESFERA_HINTS)

        for i, row in candidates.iterrows():
            row_source_name = _normalize_text(row.get("fonte")) or layer.source_name
            source_label = _source_label(row_source_name)
            text_blob = _build_row_text_blob(row, text_cols)
            descriptive_text = _extract_best_descriptive_text(
                row,
                list(dict.fromkeys(category_cols + informative_text_cols + text_cols)),
            )

            raw_name = _first_non_empty(row, name_cols)
            if _is_code_like_value(raw_name) and descriptive_text:
                raw_name = descriptive_text
            if not _has_alpha(raw_name):
                tagged_name = _extract_tagged_value(
                    text_blob,
                    [
                        "NOME_UC1",
                        "NOME_E",
                        "NOME",
                        "NOME_T",
                        "NOMEUNIDAD",
                    ],
                )
                if _has_alpha(tagged_name):
                    raw_name = tagged_name

            if not _has_alpha(raw_name):
                # fallback para descricao textual.
                raw_name = descriptive_text

            if not _has_alpha(raw_name):
                alpha_text = [t for t in [_normalize_text(row.get(c)) for c in informative_text_cols] if _has_alpha(t)]
                raw_name = alpha_text[0] if alpha_text else f"UC {source_label} {i}"

            raw_category = _first_non_empty(row, category_cols)
            if _is_code_like_value(raw_category) and descriptive_text:
                raw_category = descriptive_text
            category = _canonicalize_category(raw_category, raw_name, text_blob)
            raw_group = _first_non_empty(row, group_cols)
            group = _infer_group(category, raw_group, text_blob)
            raw_esfera = _first_non_empty(row, esfera_cols)
            esfera = _infer_esfera(raw_esfera, text_blob, layer.source_name, layer.shp_path)
            source_code = _first_non_empty(row, code_cols)

            cnuc_code = _build_cnuc_code(used_codes, source_label, i, source_code)
            prepared_rows.append(
                {
                    "cnuc_code": cnuc_code,
                    "nome_uc": _compact_uc_nome(raw_name),
                    "categoria": _compact_uc_categoria(category),
                    "grupo": _normalize_text(group),
                    "esfera": _normalize_text(esfera),
                    "source": source_label,
                    "geometry": row.geometry,
                }
            )

    if not prepared_rows:
        raise PrepareNovasFontesUcsError("Nenhuma feicao candidata a UC encontrada nas fontes.")

    prepared = gpd.GeoDataFrame(prepared_rows, geometry="geometry", crs="EPSG:4674")
    prepared = prepared[~prepared.geometry.isna()].copy()

    base_filtered = 0
    if base_ucs is not None and not base_ucs.empty:
        prepared, base_filtered = _filter_existing_against_base(prepared, base_ucs)

    if prepared.empty:
        raise PrepareNovasFontesUcsError("Todas as candidatas foram filtradas contra a base existente.")

    prepared = prepared[OUTPUT_COLUMNS].copy()
    prepared = prepared.sort_values(["cnuc_code", "nome_uc"], ascending=True).reset_index(drop=True)
    _validate_output(prepared)

    metrics = {
        "source_layers": source_in,
        "candidate_in": candidate_in,
        "base_filtered": base_filtered,
        "output_total": int(len(prepared)),
    }
    return prepared, metrics


def discover_source_layers(input_root: Path) -> List[SourceLayer]:
    if not input_root.exists():
        raise FileNotFoundError(f"Diretorio de entrada nao encontrado: {input_root}")
    if not input_root.is_dir():
        raise PrepareNovasFontesUcsError(f"Entrada invalida (nao e diretorio): {input_root}")

    curated_shp = input_root / CURATED_CANDIDATES_RELATIVE_SHAPEFILE
    if curated_shp.exists():
        gdf = gpd.read_file(curated_shp)
        return [
            SourceLayer(
                source_name="novasfontes_curated_2249",
                shp_path=curated_shp,
                gdf=gdf,
                preselected_candidates=True,
            )
        ]

    source_layers: List[SourceLayer] = []
    for shp in sorted(input_root.rglob("*.shp")):
        rel = shp.relative_to(input_root)
        if any(part.startswith("_") for part in rel.parts):
            continue
        try:
            gdf = gpd.read_file(shp)
        except Exception as exc:
            log_warn(f"Ignorando SHP com erro de leitura: {shp} ({exc})")
            continue
        source_name = rel.parts[0] if rel.parts else shp.parent.name
        source_layers.append(SourceLayer(source_name=source_name, shp_path=shp, gdf=gdf, preselected_candidates=False))
    if not source_layers:
        raise PrepareNovasFontesUcsError(f"Nenhum SHP encontrado em {input_root}")
    return source_layers


def _collect_shapefile_family(shp_path: Path) -> List[Path]:
    stem = shp_path.stem
    return sorted([p for p in shp_path.parent.glob(f"{stem}.*") if p.is_file()])


def _delete_shapefile_family(target_shp: Path) -> None:
    for file_path in target_shp.parent.glob(f"{target_shp.stem}.*"):
        if file_path.is_file():
            file_path.unlink()


def prepare_novas_fontes_ucs_files(
    input_root: Path,
    output_dir: Path,
    output_stem: str = OUTPUT_DATASET_CODE,
    base_ucs_shp: Optional[Path] = None,
) -> PrepareNovasFontesUcsResult:
    source_layers = discover_source_layers(input_root)
    use_curated_candidates = any(layer.preselected_candidates for layer in source_layers)
    base_ucs = None
    if base_ucs_shp is not None and not use_curated_candidates:
        if not base_ucs_shp.exists():
            raise FileNotFoundError(f"SHP base de UCS nao encontrado: {base_ucs_shp}")
        base_ucs = gpd.read_file(base_ucs_shp)

    prepared, metrics = build_prepared_novas_fontes_ucs(source_layers=source_layers, base_ucs=base_ucs)

    ensure_dir(output_dir)
    output_shp = output_dir / f"{output_stem}.shp"
    _delete_shapefile_family(output_shp)
    prepared.to_file(output_shp, driver="ESRI Shapefile", encoding="UTF-8")

    qa_report_path = output_dir / f"{output_stem}.qa.json"
    qa_report_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    output_files = _collect_shapefile_family(output_shp)
    output_files.append(qa_report_path)
    log_info(
        "prepare_ucs_novas_fontes: "
        + ", ".join(
            [
                f"source_layers={metrics['source_layers']}",
                f"candidate_in={metrics['candidate_in']}",
                f"base_filtered={metrics['base_filtered']}",
                f"output_total={metrics['output_total']}",
            ]
        )
    )
    return PrepareNovasFontesUcsResult(
        output_shp=output_shp,
        output_files=output_files,
        qa_report_path=qa_report_path,
        metrics=metrics,
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepara UCS das Novas Fontes para schema padrao.")
    parser.add_argument("--input-root", required=True, help="Diretorio com as fontes SHP (NovasFontes).")
    parser.add_argument("--output-dir", required=True, help="Diretorio de saida para SHP normalizado.")
    parser.add_argument("--output-stem", default=OUTPUT_DATASET_CODE, help="Nome base do arquivo SHP de saida.")
    parser.add_argument(
        "--base-ucs-shp",
        default=None,
        help="SHP base UNIDADES_CONSERVACAO para filtrar duplicados (opcional).",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    result = prepare_novas_fontes_ucs_files(
        input_root=Path(args.input_root),
        output_dir=Path(args.output_dir),
        output_stem=args.output_stem,
        base_ucs_shp=Path(args.base_ucs_shp) if args.base_ucs_shp else None,
    )
    log_info(f"SHP saida: {result.output_shp}")
    log_info(f"QA report: {result.qa_report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
