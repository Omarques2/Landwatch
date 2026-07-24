import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { totalSexo } from '../common/sexo-quantidade';

@Injectable()
export class CreditoService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const [proprietarios, aprovados, abatidos] = await Promise.all([
      this.prisma.tierProprietario.findMany({
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.tier.groupBy({
        by: ['proprietarioId'],
        where: { status: 'APROVADO' },
        _sum: { qtdMacho: true, qtdFemea: true, qtdIndefinido: true },
      }),
      this.prisma.tierAbate.groupBy({
        by: ['proprietarioId'],
        _sum: { qtdMacho: true, qtdFemea: true, qtdIndefinido: true },
      }),
    ]);

    const aprovadosPorProprietario = new Map(
      aprovados.map((row) => [
        row.proprietarioId,
        totalSexo({
          qtdMacho: row._sum.qtdMacho ?? 0,
          qtdFemea: row._sum.qtdFemea ?? 0,
          qtdIndefinido: row._sum.qtdIndefinido ?? 0,
        }),
      ]),
    );
    const abatidosPorProprietario = new Map(
      abatidos.map((row) => [
        row.proprietarioId,
        totalSexo({
          qtdMacho: row._sum.qtdMacho ?? 0,
          qtdFemea: row._sum.qtdFemea ?? 0,
          qtdIndefinido: row._sum.qtdIndefinido ?? 0,
        }),
      ]),
    );

    return proprietarios.map((proprietario) => {
      const totalAprovados = aprovadosPorProprietario.get(proprietario.id) ?? 0;
      const totalAbatidos = abatidosPorProprietario.get(proprietario.id) ?? 0;
      return {
        proprietarioId: proprietario.id,
        nome: proprietario.nome,
        aprovados: totalAprovados,
        abatidos: totalAbatidos,
        creditoRestante: totalAprovados - totalAbatidos,
      };
    });
  }
}
