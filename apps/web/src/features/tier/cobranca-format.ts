import type { CobrancaPreviewItem, CobrancaTotals } from "./types";

export function formatMoney(value: string | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
}

export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function addMoney(left: string, right: string): string {
  const cents = (value: string) => {
    const [rawWhole, rawFraction] = value.split(".");
    const whole = rawWhole ?? "0";
    const fraction = rawFraction ?? "";
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  };
  const total = cents(left) + cents(right);
  return `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
}

export function totalsForSelection(items: CobrancaPreviewItem[], selectedIds: string[]): CobrancaTotals {
  const selected = new Set(selectedIds);
  return items.reduce(
    (total, item) =>
      selected.has(item.tierId)
        ? {
            valorBase: addMoney(total.valorBase, item.valorBase),
            valorAdicional: addMoney(total.valorAdicional, item.valorAdicional),
            valorTotal: addMoney(total.valorTotal, item.valorItem),
            qtdAnimais: total.qtdAnimais + item.qtdAnimais,
            qtdAprovados: total.qtdAprovados + (item.status === "APROVADO" ? item.qtdAnimais : 0),
          }
        : total,
    { valorBase: "0.00", valorAdicional: "0.00", valorTotal: "0.00", qtdAnimais: 0, qtdAprovados: 0 },
  );
}
