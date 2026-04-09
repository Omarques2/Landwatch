import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parent))

from uc_tipo_detalhado_preview import (
    collect_unmapped_examples,
    infer_uc_tipo_detalhado,
    write_rows_xlsx,
)


class InferUcTipoDetalhadoTest(unittest.TestCase):
    def test_floresta_por_nome_e_esfera(self):
        self.assertEqual(
            infer_uc_tipo_detalhado(
                nome_uc="FLORESTA ESTADUAL RIO URUBU",
                categoria="Floresta",
                esfera="Estadual",
            ),
            "Floresta Estadual",
        )

    def test_parque_natural_municipal_por_nome(self):
        self.assertEqual(
            infer_uc_tipo_detalhado(
                nome_uc="PARQUE NATURAL MUNICIPAL DO PARAGEM",
                categoria="Parque",
                esfera="Municipal",
            ),
            "Parque Natural Municipal",
        )

    def test_reserva_extrativista_marinha_por_nome(self):
        self.assertEqual(
            infer_uc_tipo_detalhado(
                nome_uc="RESERVA EXTRATIVISTA MARINHA DE ARAÍ-PEROBA",
                categoria="Reserva Extrativista",
                esfera="Federal",
            ),
            "Reserva Extrativista Federal",
        )

    def test_parque_nacional_por_nome(self):
        self.assertEqual(
            infer_uc_tipo_detalhado(
                nome_uc="PARQUE NACIONAL DE BRASÍLIA",
                categoria="Parque",
                esfera="Federal",
            ),
            "Parque Federal",
        )

    def test_fallback_para_categoria_e_esfera(self):
        self.assertEqual(
            infer_uc_tipo_detalhado(
                nome_uc="UNIDADE QUALQUER",
                categoria="Floresta",
                esfera="Municipal",
            ),
            "Floresta Municipal",
        )

    def test_fallback_para_categoria_quando_esfera_nao_ajuda(self):
        self.assertEqual(
            infer_uc_tipo_detalhado(
                nome_uc="NOME FORA DO PADRAO",
                categoria="Reserva Biológica",
                esfera="Federal",
            ),
            "Reserva Biológica Federal",
        )

    def test_nao_casa_subtipo_no_meio_do_nome(self):
        self.assertEqual(
            infer_uc_tipo_detalhado(
                nome_uc="ÁREA DE PROTEÇÃO AMBIENTAL DO PARQUE MUNICIPAL ECOLÓGICO DE MARAPENDI",
                categoria="Área de Proteção Ambiental",
                esfera="Municipal",
            ),
            "Área de Proteção Ambiental Municipal",
        )

    def test_rppn_vira_sigla_com_esfera(self):
        self.assertEqual(
            infer_uc_tipo_detalhado(
                nome_uc="RESERVA PARTICULAR DO PATRIMÔNIO NATURAL CANADÁ",
                categoria="Reserva Particular do Patrimônio Natural",
                esfera="Estadual",
            ),
            "RPPN Estadual",
        )

    def test_area_protecao_ambiental_federal(self):
        self.assertEqual(
            infer_uc_tipo_detalhado(
                nome_uc="ÁREA DE PROTEÇÃO AMBIENTAL DA BARRA DO RIO MAMANGUAPE",
                categoria="Área de Proteção Ambiental",
                esfera="Federal",
            ),
            "Área de Proteção Ambiental Federal",
        )

    def test_escreve_xlsx_com_linhas(self):
        rows = [
            {
                "source": "federal",
                "uc_uid": "0000.00.0001",
                "nome_uc": "PARQUE NACIONAL DE TESTE",
                "categoria": "Parque",
                "esfera": "Federal",
                "uc_tipo_detalhado": "Parque Nacional",
            }
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "preview.xlsx"
            write_rows_xlsx(rows, output)

            self.assertTrue(output.exists())
            with ZipFile(output) as archive:
                workbook_xml = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")
                shared_strings = archive.read("xl/sharedStrings.xml").decode("utf-8")

            self.assertIn("PARQUE NACIONAL DE TESTE", shared_strings)
            self.assertIn("Parque Nacional", shared_strings)
            self.assertIn("<row r=\"2\">", workbook_xml)

    def test_nao_trata_nome_contraditorio_como_edge_case_quando_esfera_e_valida(self):
        rows = [
            {
                "source": "cnuc",
                "uc_uid": "1",
                "nome_uc": "PARQUE ESTADUAL DA FONTE GRANDE",
                "categoria": "Parque",
                "esfera": "Municipal",
                "uc_tipo_detalhado": "Parque Municipal",
            }
        ]

        examples = collect_unmapped_examples(rows)

        self.assertEqual(examples, [])


if __name__ == "__main__":
    unittest.main()
