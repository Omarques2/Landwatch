import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export interface SexoQuantidade {
  qtdMacho: number;
  qtdFemea: number;
  qtdIndefinido: number;
}

// Total derivado — nunca armazenado nas linhas vivas de Tier/Abate.
export function totalSexo(q: SexoQuantidade): number {
  return q.qtdMacho + q.qtdFemea + q.qtdIndefinido;
}

// Regra unica p/ create e update:
// - nenhum dos tres presente  -> valido (update que nao mexe no breakdown)
// - parcialmente presente      -> invalido (informe os tres juntos)
// - os tres presentes          -> soma deve ser >= 1
export function SexoQuantidadeValida(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'sexoQuantidadeValida',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(_value: unknown, args?: ValidationArguments) {
          const o = (args?.object ?? {}) as Record<string, unknown>;
          const vals = [o.qtdMacho, o.qtdFemea, o.qtdIndefinido];
          const presentes = vals.filter((v) => v !== undefined && v !== null);
          if (presentes.length === 0) return true;
          if (presentes.length < 3) return false;
          return presentes.reduce<number>((s, v) => s + Number(v), 0) >= 1;
        },
        defaultMessage() {
          return 'Informe qtdMacho, qtdFemea e qtdIndefinido juntos, com soma >= 1';
        },
      },
    });
  };
}
