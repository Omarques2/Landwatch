from __future__ import annotations

from gta_extractor.text_utils import normalize, only_digits


SYSTEM_UF = {"SIDAGO": "GO", "ADAPEC": "TO", "GEDAVE": "SP"}


def validate_record(data: dict) -> tuple[str, list[str]]:
    warnings: list[str] = []
    for key in ("numero_gta", "serie_gta", "uf_gta", "sistema", "data_emissao", "especie", "finalidade"):
        if not str(data.get(key, "") or "").strip():
            warnings.append(f"missing:{key}")

    system = str(data.get("sistema", "") or "")
    uf = str(data.get("uf_gta", "") or "")
    if system in SYSTEM_UF and uf and uf != SYSTEM_UF[system]:
        warnings.append("uf_incompativel_sistema")

    if not _party_ok(data, "origem"):
        warnings.append("missing:origem_identificacao")
    if not _party_ok(data, "destino"):
        warnings.append("missing:destino_identificacao")
    warnings.extend(_semantic_warnings(data))

    male = _sum(data, ("0_12_M", "13_24_M", "25_36_M", "36+_M"))
    female = _sum(data, ("0_12_F", "13_24_F", "25_36_F", "36+_F"))
    if male != int(data.get("total_M", 0) or 0):
        warnings.append("sum_mismatch:total_M")
    if female != int(data.get("total_F", 0) or 0):
        warnings.append("sum_mismatch:total_F")
    if male + female <= 0 and system != "ERRO":
        warnings.append("missing:total_animais")

    for key in ("origem.cpf_cnpj", "destino.cpf_cnpj"):
        value = only_digits(str(data.get(key, "") or ""))
        if value and not _valid_document_shape(value):
            warnings.append(f"invalid:{key}")

    if system == "ERRO":
        return "failed", warnings
    if any(
        w.startswith(("missing:numero_gta", "missing:sistema", "missing:data_emissao", "missing:especie", "missing:finalidade"))
        for w in warnings
    ):
        return "needs_review", warnings
    if warnings:
        return "warning", warnings
    return "ok", warnings


def _sum(data: dict, keys: tuple[str, ...]) -> int:
    total = 0
    for key in keys:
        try:
            total += int(data.get(key, 0) or 0)
        except Exception:
            pass
    return total


def _party_ok(data: dict, prefix: str) -> bool:
    doc = only_digits(str(data.get(f"{prefix}.cpf_cnpj", "") or ""))
    if doc and _valid_document_shape(doc):
        return True
    name = str(data.get(f"{prefix}.nome", "") or "").strip()
    establishment = str(data.get(f"{prefix}.estabelecimento", "") or "").strip()
    return bool(name and establishment and not _looks_like_document(name) and not _looks_like_code(establishment))


def _semantic_warnings(data: dict) -> list[str]:
    warnings: list[str] = []
    for prefix in ("origem", "destino"):
        establishment = str(data.get(f"{prefix}.estabelecimento", "") or "")
        name = str(data.get(f"{prefix}.nome", "") or "")
        city = str(data.get(f"{prefix}.municipio", "") or "")
        if establishment and _looks_like_code(establishment):
            warnings.append(f"suspicious:{prefix}.estabelecimento_codigo")
        if name and _looks_like_document(name):
            warnings.append(f"suspicious:{prefix}.nome_documento")
        if city and any(token in normalize(city) for token in ["marca do rebanho", "finalidade", "especie", "cpf", "cnpj"]):
            warnings.append(f"suspicious:{prefix}.municipio")
    finalidade = normalize(str(data.get("finalidade", "") or ""))
    especie = normalize(str(data.get("especie", "") or ""))
    if finalidade in {"bovino", "bovinos", "bovideos"}:
        warnings.append("suspicious:finalidade_especie")
    if especie in {"abate", "engorda", "recria", "reproducao"}:
        warnings.append("suspicious:especie_finalidade")
    return warnings


def _valid_document_shape(value: str) -> bool:
    digits = only_digits(value)
    if len(digits) == 11:
        return _valid_cpf(digits)
    if len(digits) == 14:
        return _valid_cnpj(digits)
    return False


def is_valid_document_number(value: str) -> bool:
    return _valid_document_shape(value)


def _looks_like_document(value: str) -> bool:
    return len(only_digits(value)) in (11, 14)


def _looks_like_code(value: str) -> bool:
    compact = only_digits(value)
    stripped = value.replace(" ", "")
    normalized = normalize(value)
    if compact and len(compact) >= 6 and len(compact) >= len(stripped) * 0.75:
        return True
    return normalized in {"marca do rebanho", "cpf", "cnpj", "municipio", "fazenda", "sitio", "chacara", "estancia"}


def _valid_cpf(digits: str) -> bool:
    if len(digits) != 11 or len(set(digits)) == 1:
        return False
    for size in (9, 10):
        total = sum(int(digits[i]) * (size + 1 - i) for i in range(size))
        check = (total * 10) % 11
        if check == 10:
            check = 0
        if check != int(digits[size]):
            return False
    return True


def _valid_cnpj(digits: str) -> bool:
    if len(digits) != 14 or len(set(digits)) == 1:
        return False
    weights_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    weights_2 = [6] + weights_1
    first = _cnpj_digit(digits[:12], weights_1)
    second = _cnpj_digit(digits[:12] + str(first), weights_2)
    return digits[-2:] == f"{first}{second}"


def _cnpj_digit(base: str, weights: list[int]) -> int:
    total = sum(int(digit) * weight for digit, weight in zip(base, weights))
    rest = total % 11
    return 0 if rest < 2 else 11 - rest


def safe_business_key(data: dict) -> tuple[str, str, str] | None:
    uf = str(data.get("uf_gta", "") or "").strip()
    serie = str(data.get("serie_gta", "") or "").strip()
    numero = str(data.get("numero_gta", "") or "").strip()
    if not uf or not serie or not numero:
        return None
    return uf, serie, numero
