COMMON_COLUMNS = [
    "arquivo", "sistema", "metodo_texto",
    "numero_gta", "serie_gta", "uf_gta",
    "data_emissao",
    "origem.cpf_cnpj", "origem.nome", "origem.estabelecimento",
    "origem.codigo_estabelecimento", "origem.municipio", "origem.uf",
    "destino.cpf_cnpj", "destino.nome", "destino.estabelecimento",
    "destino.codigo_estabelecimento", "destino.municipio", "destino.uf",
    "especie", "finalidade",
    "0_12_M", "0_12_F", "13_24_M", "13_24_F",
    "25_36_M", "25_36_F", "36+_M", "36+_F",
    "total_M", "total_F",
]

NUMERIC_COLUMNS = {
    "0_12_M", "0_12_F", "13_24_M", "13_24_F",
    "25_36_M", "25_36_F", "36+_M", "36+_F",
    "total_M", "total_F",
}

