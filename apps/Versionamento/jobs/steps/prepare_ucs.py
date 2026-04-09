import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import geopandas as gpd
import pandas as pd

from .common import DatasetArtifact, ensure_dir, log_info, log_warn

OUTPUT_DATASET_CODE = "UNIDADES_CONSERVACAO"
OUTPUT_FILENAME = f"{OUTPUT_DATASET_CODE}.shp"
ALLOWED_SOURCE_VALUES = {"FEDERAL", "CNUC_COMPLEMENTAR"}
FEDERAL_SIGLA_TO_CNUC_CATEGORY = {
    "APA": "Área de Proteção Ambiental",
    "ARIE": "Área de Relevante Interesse Ecológico",
    "ESEC": "Estação Ecológica",
    "FLONA": "Floresta",
    "MONA": "Monumento Natural",
    "PARNA": "Parque",
    "RDS": "Reserva de Desenvolvimento Sustentável",
    "REBIO": "Reserva Biológica",
    "RESEX": "Reserva Extrativista",
    "REVIS": "Refúgio de Vida Silvestre",
}


class PrepareUcsError(RuntimeError):
    pass


@dataclass
class PrepareUcsResult:
    output_shp: Path
    output_files: List[Path]
    qa_report_path: Path
    metrics: Dict[str, int]


def _normalize_text(value) -> Optional[str]:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    return text if text else None


def normalize_cnuc_code(value) -> Optional[str]:
    text = _normalize_text(value)
    if text is None:
        return None
    return text.upper()


def _normalize_sigla(value) -> Optional[str]:
    text = _normalize_text(value)
    if text is None:
        return None
    return text.upper()


def _resolve_column(columns: Sequence[str], *candidates: str) -> str:
    low_map = {c.lower(): c for c in columns}
    for candidate in candidates:
        col = low_map.get(candidate.lower())
        if col:
            return col
    raise PrepareUcsError(f"Coluna obrigatoria ausente. Candidatas: {', '.join(candidates)}")


def _resolve_optional_column(columns: Sequence[str], *candidates: str) -> Optional[str]:
    low_map = {c.lower(): c for c in columns}
    for candidate in candidates:
        col = low_map.get(candidate.lower())
        if col:
            return col
    return None


def _require_no_null_or_duplicate_codes(df: pd.DataFrame, code_col: str, source_name: str) -> None:
    null_codes = df[code_col].isna().sum()
    if null_codes:
        raise PrepareUcsError(f"{source_name}: {null_codes} linha(s) com codigo CNUC nulo/vazio.")
    dup_mask = df.duplicated(subset=[code_col], keep=False)
    dup_count = int(dup_mask.sum())
    if dup_count:
        examples = sorted(df.loc[dup_mask, code_col].dropna().astype(str).unique().tolist())[:5]
        raise PrepareUcsError(
            f"{source_name}: {dup_count} linha(s) com codigo CNUC duplicado apos normalizacao. Exemplos: {examples}"
        )


def _normalize_federal(federal: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    code_col = _resolve_column(federal.columns, "Cnuc", "cnuc")
    name_col = _resolve_column(federal.columns, "NomeUC", "nome_uc", "nomeuc")
    sigla_col = _resolve_optional_column(federal.columns, "SiglaCateg", "siglacateg")
    grupo_col = _resolve_optional_column(federal.columns, "GrupoUC", "grupouc")
    esfera_col = _resolve_optional_column(federal.columns, "EsferaAdm", "esferaadm")

    keep_cols = [code_col, name_col, federal.geometry.name]
    rename_map = {code_col: "cnuc_code", name_col: "nome_uc"}
    if sigla_col:
        keep_cols.append(sigla_col)
        rename_map[sigla_col] = "categoria_federal"
    if grupo_col:
        keep_cols.append(grupo_col)
        rename_map[grupo_col] = "grupo_federal"
    if esfera_col:
        keep_cols.append(esfera_col)
        rename_map[esfera_col] = "esfera_federal"

    out = federal[keep_cols].copy()
    out = out.rename(columns=rename_map)
    out["cnuc_code"] = out["cnuc_code"].map(normalize_cnuc_code)
    out["nome_uc"] = out["nome_uc"].map(_normalize_text)
    if "categoria_federal" in out.columns:
        out["categoria_federal"] = out["categoria_federal"].map(_normalize_text)
    if "grupo_federal" in out.columns:
        out["grupo_federal"] = out["grupo_federal"].map(_normalize_text)
    if "esfera_federal" in out.columns:
        out["esfera_federal"] = out["esfera_federal"].map(_normalize_text)
    out = gpd.GeoDataFrame(out, geometry=federal.geometry.name, crs=federal.crs)
    if out.geometry.name != "geometry":
        out = out.rename_geometry("geometry")
    _require_no_null_or_duplicate_codes(out, "cnuc_code", "Federal")
    return out


def _normalize_cnuc(cnuc: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    code_col = _resolve_column(cnuc.columns, "cd_cnuc")
    name_col = _resolve_column(cnuc.columns, "nome_uc", "nomeuc")
    categoria_col = _resolve_column(cnuc.columns, "categoria")
    grupo_col = _resolve_column(cnuc.columns, "grupo")
    esfera_col = _resolve_column(cnuc.columns, "esfera")
    situacao_col = _resolve_column(cnuc.columns, "situacao")

    out = cnuc[[code_col, name_col, categoria_col, grupo_col, esfera_col, situacao_col, cnuc.geometry.name]].copy()
    out = out.rename(
        columns={
            code_col: "cnuc_code",
            name_col: "nome_uc",
            categoria_col: "categoria",
            grupo_col: "grupo",
            esfera_col: "esfera",
            situacao_col: "situacao",
        }
    )
    out["cnuc_code"] = out["cnuc_code"].map(normalize_cnuc_code)
    for col in ["nome_uc", "categoria", "grupo", "esfera", "situacao"]:
        out[col] = out[col].map(_normalize_text)
    out = gpd.GeoDataFrame(out, geometry=cnuc.geometry.name, crs=cnuc.crs)
    if out.geometry.name != "geometry":
        out = out.rename_geometry("geometry")
    _require_no_null_or_duplicate_codes(out, "cnuc_code", "CNUC")
    return out


def _validate_prepared_output(prepared: gpd.GeoDataFrame) -> None:
    if prepared.empty:
        raise PrepareUcsError("Output UCS preparado vazio.")

    null_code = int(prepared["cnuc_code"].isna().sum())
    if null_code:
        raise PrepareUcsError(f"Output UCS invalido: {null_code} codigo(s) nulo(s).")

    duplicated = int(prepared.duplicated(subset=["cnuc_code"]).sum())
    if duplicated:
        raise PrepareUcsError(f"Output UCS invalido: {duplicated} codigo(s) duplicado(s).")

    for col in ["nome_uc", "categoria", "grupo", "esfera"]:
        null_or_blank = int(prepared[col].isna().sum() + (prepared[col] == "").sum())
        if null_or_blank:
            raise PrepareUcsError(f"Output UCS invalido: coluna '{col}' com {null_or_blank} valor(es) nulo(s)/vazio(s).")

    invalid_source = int((~prepared["source"].isin(ALLOWED_SOURCE_VALUES)).sum())
    if invalid_source:
        raise PrepareUcsError(f"Output UCS invalido: {invalid_source} linha(s) com source invalido.")

    null_geom = int(prepared.geometry.isna().sum())
    if null_geom:
        raise PrepareUcsError(f"Output UCS invalido: {null_geom} geometria(s) nula(s).")


def build_prepared_ucs(
    federal: gpd.GeoDataFrame,
    cnuc: gpd.GeoDataFrame,
) -> Tuple[gpd.GeoDataFrame, Dict[str, int]]:
    fed = _normalize_federal(federal)
    cnu = _normalize_cnuc(cnuc)
    if fed.crs and cnu.crs and fed.crs != cnu.crs:
        cnu = cnu.to_crs(fed.crs)
    elif fed.crs is None and cnu.crs is not None:
        fed = fed.set_crs(cnu.crs, allow_override=True)
    elif cnu.crs is None and fed.crs is not None:
        cnu = cnu.set_crs(fed.crs, allow_override=True)

    fed_codes = set(fed["cnuc_code"].tolist())
    cnu_codes = set(cnu["cnuc_code"].tolist())
    intersect_codes = fed_codes.intersection(cnu_codes)
    complement_codes = cnu_codes.difference(fed_codes)

    cnuc_lookup = cnu[["cnuc_code", "categoria", "grupo", "esfera", "situacao", "nome_uc"]].rename(
        columns={"nome_uc": "nome_uc_cnuc"}
    )
    fed_enriched = fed.merge(cnuc_lookup, on="cnuc_code", how="left")
    fed_enriched["nome_uc"] = fed_enriched["nome_uc"].fillna(fed_enriched["nome_uc_cnuc"])
    fed_missing_cnuc_categoria = int(fed_enriched["categoria"].isna().sum())
    fed_missing_cnuc_grupo = int(fed_enriched["grupo"].isna().sum())
    fed_missing_cnuc_esfera = int(fed_enriched["esfera"].isna().sum())
    if fed_missing_cnuc_categoria:
        log_warn(
            "prepare_ucs: "
            f"{fed_missing_cnuc_categoria} federal sem categoria no CNUC; aplicando fallback de atributos federais."
        )
    if "categoria_federal" in fed_enriched.columns:
        missing_mask = fed_enriched["categoria"].isna()
        sigla_series = fed_enriched["categoria_federal"].map(_normalize_sigla)
        mapped_series = sigla_series.map(FEDERAL_SIGLA_TO_CNUC_CATEGORY)
        unmapped_siglas = sorted(
            sigla_series[missing_mask & mapped_series.isna() & sigla_series.notna()].dropna().unique().tolist()
        )
        if unmapped_siglas:
            log_warn(
                "prepare_ucs: sigla(s) federal sem de/para para categoria CNUC: "
                + ", ".join(unmapped_siglas)
            )
        fed_enriched["categoria"] = fed_enriched["categoria"].fillna(mapped_series).fillna(fed_enriched["categoria_federal"])
    if "grupo_federal" in fed_enriched.columns:
        fed_enriched["grupo"] = fed_enriched["grupo"].fillna(fed_enriched["grupo_federal"])
    if "esfera_federal" in fed_enriched.columns:
        fed_enriched["esfera"] = fed_enriched["esfera"].fillna(fed_enriched["esfera_federal"])
    fed_enriched["source"] = "FEDERAL"

    complement = cnu[cnu["cnuc_code"].isin(complement_codes)].copy()
    complement["source"] = "CNUC_COMPLEMENTAR"

    fed_out = fed_enriched[["cnuc_code", "nome_uc", "categoria", "grupo", "esfera", "source", fed_enriched.geometry.name]]
    cnu_out = complement[["cnuc_code", "nome_uc", "categoria", "grupo", "esfera", "source", complement.geometry.name]]

    prepared = pd.concat([fed_out, cnu_out], ignore_index=True)
    prepared = gpd.GeoDataFrame(prepared, geometry=fed.geometry.name, crs=fed.crs or cnu.crs)

    dropped_null_geom = int(prepared.geometry.isna().sum())
    if dropped_null_geom:
        log_warn(f"prepare_ucs: removendo {dropped_null_geom} linha(s) com geometria nula.")
        prepared = prepared[~prepared.geometry.isna()].copy()

    prepared["cnuc_code"] = prepared["cnuc_code"].map(normalize_cnuc_code)
    for col in ["nome_uc", "categoria", "grupo", "esfera", "source"]:
        prepared[col] = prepared[col].map(_normalize_text)

    prepared = prepared.sort_values(by=["cnuc_code"], ascending=True).reset_index(drop=True)
    _validate_prepared_output(prepared)

    metrics = {
        "fed_in": int(len(fed)),
        "cnuc_in": int(len(cnu)),
        "intersect": int(len(intersect_codes)),
        "cnuc_complement": int(len(complement_codes)),
        "fed_missing_cnuc_categoria": fed_missing_cnuc_categoria,
        "fed_missing_cnuc_grupo": fed_missing_cnuc_grupo,
        "fed_missing_cnuc_esfera": fed_missing_cnuc_esfera,
        "dropped_null_geom": dropped_null_geom,
        "output_total": int(len(prepared)),
    }
    return prepared, metrics


def _collect_shapefile_family(shp_path: Path) -> List[Path]:
    stem = shp_path.stem
    return sorted([p for p in shp_path.parent.glob(f"{stem}.*") if p.is_file()])


def _delete_shapefile_family(target_shp: Path) -> None:
    for file_path in target_shp.parent.glob(f"{target_shp.stem}.*"):
        if file_path.is_file():
            file_path.unlink()


def prepare_ucs_files(
    fed_shp: Path,
    cnuc_shp: Path,
    output_dir: Path,
    output_stem: str = OUTPUT_DATASET_CODE,
) -> PrepareUcsResult:
    if not fed_shp.exists():
        raise FileNotFoundError(f"SHP federal nao encontrado: {fed_shp}")
    if not cnuc_shp.exists():
        raise FileNotFoundError(f"SHP CNUC nao encontrado: {cnuc_shp}")

    ensure_dir(output_dir)
    output_shp = output_dir / f"{output_stem}.shp"

    federal = gpd.read_file(fed_shp)
    cnuc = gpd.read_file(cnuc_shp)
    prepared, metrics = build_prepared_ucs(federal, cnuc)

    _delete_shapefile_family(output_shp)
    prepared.to_file(output_shp, driver="ESRI Shapefile", encoding="UTF-8")

    qa_report_path = output_dir / f"{output_stem}.qa.json"
    qa_report_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    output_files = _collect_shapefile_family(output_shp)
    output_files.append(qa_report_path)
    log_info(
        "prepare_ucs: "
        + ", ".join(
            [
                f"fed_in={metrics['fed_in']}",
                f"cnuc_in={metrics['cnuc_in']}",
                f"intersect={metrics['intersect']}",
                f"cnuc_complement={metrics['cnuc_complement']}",
                f"fed_missing_cnuc_categoria={metrics['fed_missing_cnuc_categoria']}",
                f"dropped_null_geom={metrics['dropped_null_geom']}",
                f"output_total={metrics['output_total']}",
            ]
        )
    )

    return PrepareUcsResult(
        output_shp=output_shp,
        output_files=output_files,
        qa_report_path=qa_report_path,
        metrics=metrics,
    )


def _guess_source_from_columns(file_path: Path) -> Optional[str]:
    try:
        gdf = gpd.read_file(file_path, rows=1)
    except Exception:
        return None
    cols = {c.lower() for c in gdf.columns}
    if {"cnuc", "nomeuc"}.issubset(cols):
        return "federal"
    if {"cd_cnuc", "categoria", "grupo", "esfera"}.issubset(cols):
        return "cnuc"
    return None


def find_ucs_source_shps(artifacts: Iterable[DatasetArtifact]) -> Tuple[Path, Path]:
    fed_candidates: List[Path] = []
    cnuc_candidates: List[Path] = []

    for art in artifacts:
        for file_path in art.files:
            if file_path.suffix.lower() != ".shp":
                continue
            source = _guess_source_from_columns(file_path)
            if source == "federal":
                fed_candidates.append(file_path)
            elif source == "cnuc":
                cnuc_candidates.append(file_path)

    if not fed_candidates:
        raise PrepareUcsError("Nao foi encontrado SHP federal de UCS (colunas esperadas: Cnuc/NomeUC).")
    if not cnuc_candidates:
        raise PrepareUcsError("Nao foi encontrado SHP CNUC (colunas esperadas: cd_cnuc/categoria/grupo/esfera).")

    if len(fed_candidates) > 1:
        raise PrepareUcsError(f"Foram encontrados {len(fed_candidates)} SHPs federais; esperado apenas 1.")
    if len(cnuc_candidates) > 1:
        raise PrepareUcsError(f"Foram encontrados {len(cnuc_candidates)} SHPs CNUC; esperado apenas 1.")

    return fed_candidates[0], cnuc_candidates[0]


def run(
    artifacts: Iterable[DatasetArtifact],
    work_dir: Path,
    snapshot_date: str,
) -> DatasetArtifact:
    fed_shp, cnuc_shp = find_ucs_source_shps(artifacts)
    output_dir = work_dir / "URL" / "UCS"
    result = prepare_ucs_files(fed_shp=fed_shp, cnuc_shp=cnuc_shp, output_dir=output_dir)
    return DatasetArtifact(
        category="UCS",
        dataset_code=OUTPUT_DATASET_CODE,
        files=result.output_files,
        snapshot_date=snapshot_date,
        extra={
            "prepared": True,
            "fed_shp": str(fed_shp),
            "cnuc_shp": str(cnuc_shp),
            "qa_report": str(result.qa_report_path),
            "qa_metrics": result.metrics,
        },
    )
