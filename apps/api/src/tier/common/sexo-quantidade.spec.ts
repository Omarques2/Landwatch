import { validate } from 'class-validator';
import { totalSexo, SexoQuantidadeValida } from './sexo-quantidade';

class Alvo {
  qtdMacho?: number;
  qtdFemea?: number;
  qtdIndefinido?: number;
  @SexoQuantidadeValida() _check!: unknown;
}

function make(v: Partial<Alvo>) {
  return Object.assign(new Alvo(), v);
}

describe('totalSexo', () => {
  it('soma as tres colunas', () => {
    expect(totalSexo({ qtdMacho: 3, qtdFemea: 2, qtdIndefinido: 5 })).toBe(10);
  });
});

describe('SexoQuantidadeValida', () => {
  it('aceita os tres presentes com soma >= 1', async () => {
    const errors = await validate(
      make({ qtdMacho: 1, qtdFemea: 0, qtdIndefinido: 0 }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejeita soma zero', async () => {
    const errors = await validate(
      make({ qtdMacho: 0, qtdFemea: 0, qtdIndefinido: 0 }),
    );
    expect(errors).toHaveLength(1);
  });

  it('rejeita triple incompleto (so alguns presentes)', async () => {
    const errors = await validate(make({ qtdMacho: 1 }));
    expect(errors).toHaveLength(1);
  });

  it('aceita nenhum presente (update sem mexer no breakdown)', async () => {
    const errors = await validate(make({}));
    expect(errors).toHaveLength(0);
  });
});
