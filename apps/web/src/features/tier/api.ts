import { http } from "@/api/http";
import { unwrapData, unwrapPaged, type ApiEnvelope, type Paged } from "@/api/envelope";
import type {
  Abate,
  AbateConsumo,
  Car,
  CarAnalise,
  Credito,
  CreditoRow,
  Cobranca,
  CobrancaPreview,
  CobrancaStatus,
  Documento,
  Fazenda,
  Frigorifico,
  GrupoFrigorifico,
  Gta,
  GtaExtractionResult,
  Lote,
  Proprietario,
  Tier,
  TierDetail,
  TierStatus,
} from "./types";

// ---- Proprietarios ----
export async function listProprietarios(
  params: {
    search?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<Paged<Proprietario>> {
  const res = await http.get<ApiEnvelope<Proprietario[]>>("/v1/tier/proprietarios", { params });
  return unwrapPaged(res.data);
}

export async function getProprietario(id: string): Promise<Proprietario> {
  const res = await http.get<ApiEnvelope<Proprietario>>(`/v1/tier/proprietarios/${id}`);
  return unwrapData(res.data);
}

export async function createProprietario(body: Partial<Proprietario>): Promise<Proprietario> {
  const res = await http.post<ApiEnvelope<Proprietario>>("/v1/tier/proprietarios", body);
  return unwrapData(res.data);
}

export async function updateProprietario(id: string, body: Partial<Proprietario>): Promise<Proprietario> {
  const res = await http.put<ApiEnvelope<Proprietario>>(`/v1/tier/proprietarios/${id}`, body);
  return unwrapData(res.data);
}

export async function deleteProprietario(id: string): Promise<{ id: string }> {
  const res = await http.delete<ApiEnvelope<{ id: string }>>(`/v1/tier/proprietarios/${id}`);
  return unwrapData(res.data);
}

export async function getCredito(proprietarioId: string): Promise<Credito> {
  const res = await http.get<ApiEnvelope<Credito>>(`/v1/tier/proprietarios/${proprietarioId}/credito`);
  return unwrapData(res.data);
}

export async function listCreditos(): Promise<CreditoRow[]> {
  const res = await http.get<ApiEnvelope<CreditoRow[]>>("/v1/tier/credito");
  return unwrapData(res.data);
}

export async function listCobrancas(
  params: {
    proprietarioId?: string;
    status?: CobrancaStatus;
    ini?: string;
    fim?: string;
  } = {},
): Promise<Cobranca[]> {
  const res = await http.get<ApiEnvelope<Cobranca[]>>("/v1/tier/cobrancas", { params });
  return unwrapData(res.data);
}

export async function getCobranca(id: string): Promise<Cobranca> {
  const res = await http.get<ApiEnvelope<Cobranca>>(`/v1/tier/cobrancas/${id}`);
  return unwrapData(res.data);
}

export async function previewCobranca(params: {
  proprietarioId: string;
  ini: string;
  fim: string;
}): Promise<CobrancaPreview> {
  const res = await http.get<ApiEnvelope<CobrancaPreview>>("/v1/tier/cobrancas/preview", { params });
  return unwrapData(res.data);
}

export async function createCobranca(body: {
  proprietarioId: string;
  periodoIni: string;
  periodoFim: string;
  tierIds: string[];
  confirmOverlap?: boolean;
}): Promise<Cobranca> {
  const res = await http.post<ApiEnvelope<Cobranca>>("/v1/tier/cobrancas", body);
  return unwrapData(res.data);
}

export async function updateCobranca(
  id: string,
  body: { periodoIni?: string; periodoFim?: string; tierIds?: string[]; confirmOverlap?: boolean },
): Promise<Cobranca> {
  const res = await http.put<ApiEnvelope<Cobranca>>(`/v1/tier/cobrancas/${id}`, body);
  return unwrapData(res.data);
}

export async function resyncCobranca(id: string): Promise<Cobranca> {
  const res = await http.post<ApiEnvelope<Cobranca>>(`/v1/tier/cobrancas/${id}/resync`);
  return unwrapData(res.data);
}

export async function pagarCobranca(
  id: string,
  body: { dataPagamento?: string; valorPago?: string },
): Promise<Cobranca> {
  const res = await http.post<ApiEnvelope<Cobranca>>(`/v1/tier/cobrancas/${id}/pagar`, body);
  return unwrapData(res.data);
}

export async function reabrirCobranca(id: string): Promise<Cobranca> {
  const res = await http.post<ApiEnvelope<Cobranca>>(`/v1/tier/cobrancas/${id}/reabrir`);
  return unwrapData(res.data);
}

export async function cancelarCobranca(id: string): Promise<Cobranca> {
  const res = await http.post<ApiEnvelope<Cobranca>>(`/v1/tier/cobrancas/${id}/cancelar`);
  return unwrapData(res.data);
}

export async function downloadCobrancaPdf(id: string): Promise<void> {
  const res = await http.get(`/v1/tier/cobrancas/${id}/pdf`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `fatura-${id}.pdf`;
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// ---- Fazendas ----
export async function listFazendas(
  params: {
    search?: string;
    proprietarioDonoId?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<Paged<Fazenda>> {
  const res = await http.get<ApiEnvelope<Fazenda[]>>("/v1/tier/fazendas", {
    params,
  });
  return unwrapPaged(res.data);
}

export async function getFazenda(id: string): Promise<Fazenda> {
  const res = await http.get<ApiEnvelope<Fazenda>>(`/v1/tier/fazendas/${id}`);
  return unwrapData(res.data);
}

export async function createFazenda(body: Partial<Fazenda>): Promise<Fazenda> {
  const res = await http.post<ApiEnvelope<Fazenda>>("/v1/tier/fazendas", body);
  return unwrapData(res.data);
}

export async function updateFazenda(id: string, body: Partial<Fazenda>): Promise<Fazenda> {
  const res = await http.put<ApiEnvelope<Fazenda>>(`/v1/tier/fazendas/${id}`, body);
  return unwrapData(res.data);
}

export async function deleteFazenda(id: string): Promise<{ id: string }> {
  const res = await http.delete<ApiEnvelope<{ id: string }>>(`/v1/tier/fazendas/${id}`);
  return unwrapData(res.data);
}

// ---- Cars ----
export async function listCars(
  params: {
    fazendaId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<Paged<Car>> {
  const res = await http.get<ApiEnvelope<Car[]>>("/v1/tier/cars", { params });
  return unwrapPaged(res.data);
}

export async function createCar(body: Partial<Car>): Promise<Car> {
  const res = await http.post<ApiEnvelope<Car>>("/v1/tier/cars", body);
  return unwrapData(res.data);
}

export async function updateCar(id: string, body: Partial<Car>): Promise<Car> {
  const res = await http.put<ApiEnvelope<Car>>(`/v1/tier/cars/${id}`, body);
  return unwrapData(res.data);
}

export async function deleteCar(id: string): Promise<{ id: string }> {
  const res = await http.delete<ApiEnvelope<{ id: string }>>(`/v1/tier/cars/${id}`);
  return unwrapData(res.data);
}

export async function getCarAnalise(id: string): Promise<CarAnalise> {
  const res = await http.get<ApiEnvelope<CarAnalise>>(`/v1/tier/cars/${id}/analise`);
  return unwrapData(res.data);
}

// ---- Frigorificos + grupos ----
export async function listFrigorificos(
  params: {
    search?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<Paged<Frigorifico>> {
  const res = await http.get<ApiEnvelope<Frigorifico[]>>("/v1/tier/frigorificos", { params });
  return unwrapPaged(res.data);
}

export async function createFrigorifico(body: Partial<Frigorifico>): Promise<Frigorifico> {
  const res = await http.post<ApiEnvelope<Frigorifico>>("/v1/tier/frigorificos", body);
  return unwrapData(res.data);
}

export async function updateFrigorifico(id: string, body: Partial<Frigorifico>): Promise<Frigorifico> {
  const res = await http.put<ApiEnvelope<Frigorifico>>(`/v1/tier/frigorificos/${id}`, body);
  return unwrapData(res.data);
}

export async function deleteFrigorifico(id: string): Promise<{ id: string }> {
  const res = await http.delete<ApiEnvelope<{ id: string }>>(`/v1/tier/frigorificos/${id}`);
  return unwrapData(res.data);
}

export async function listGruposFrigorifico(
  params: {
    search?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<Paged<GrupoFrigorifico>> {
  const res = await http.get<ApiEnvelope<GrupoFrigorifico[]>>("/v1/tier/grupos-frigorifico", { params });
  return unwrapPaged(res.data);
}

export async function createGrupoFrigorifico(body: Partial<GrupoFrigorifico>): Promise<GrupoFrigorifico> {
  const res = await http.post<ApiEnvelope<GrupoFrigorifico>>("/v1/tier/grupos-frigorifico", body);
  return unwrapData(res.data);
}

export async function deleteGrupoFrigorifico(id: string): Promise<{ id: string }> {
  const res = await http.delete<ApiEnvelope<{ id: string }>>(`/v1/tier/grupos-frigorifico/${id}`);
  return unwrapData(res.data);
}

// ---- Tiers ----
export async function listTiers(
  params: {
    proprietarioId?: string;
    fazendaId?: string;
    status?: TierStatus;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<Paged<Tier>> {
  const res = await http.get<ApiEnvelope<Tier[]>>("/v1/tier/tiers", { params });
  return unwrapPaged(res.data);
}

export async function getTier(id: string): Promise<TierDetail> {
  const res = await http.get<ApiEnvelope<TierDetail>>(`/v1/tier/tiers/${id}`);
  return unwrapData(res.data);
}

export async function createTier(body: {
  proprietarioId: string;
  fazendaId: string;
  qtdAnimais: number;
  frigorificoId?: string;
  data: string;
}): Promise<Tier> {
  const res = await http.post<ApiEnvelope<Tier>>("/v1/tier/tiers", body);
  return unwrapData(res.data);
}

export async function updateTier(
  id: string,
  body: { qtdAnimais?: number; frigorificoId?: string; data?: string },
): Promise<Tier> {
  const res = await http.put<ApiEnvelope<Tier>>(`/v1/tier/tiers/${id}`, body);
  return unwrapData(res.data);
}

export async function setTierStatus(id: string, body: { status: TierStatus; validadoPor?: string }): Promise<Tier> {
  const res = await http.post<ApiEnvelope<Tier>>(`/v1/tier/tiers/${id}/status`, body);
  return unwrapData(res.data);
}

export async function setTierContrato(
  id: string,
  body: {
    contratoValorAnimal?: string;
    contratoValorAdicionalAprovado?: string;
  },
): Promise<Tier> {
  const res = await http.put<ApiEnvelope<Tier>>(`/v1/tier/tiers/${id}/contrato`, body);
  return unwrapData(res.data);
}

export async function deleteTier(id: string): Promise<{ id: string }> {
  const res = await http.delete<ApiEnvelope<{ id: string }>>(`/v1/tier/tiers/${id}`);
  return unwrapData(res.data);
}

// ---- Lotes ----
export async function listLotes(tierId: string): Promise<Lote[]> {
  const res = await http.get<ApiEnvelope<Lote[]>>("/v1/tier/lotes", {
    params: { tierId },
  });
  return unwrapData(res.data);
}

export async function getLote(id: string): Promise<Lote> {
  const res = await http.get<ApiEnvelope<Lote>>(`/v1/tier/lotes/${id}`);
  return unwrapData(res.data);
}

export async function createLote(body: { tierId: string; nome: string }): Promise<Lote> {
  const res = await http.post<ApiEnvelope<Lote>>("/v1/tier/lotes", body);
  return unwrapData(res.data);
}

export async function updateLote(id: string, body: { nome?: string }): Promise<Lote> {
  const res = await http.put<ApiEnvelope<Lote>>(`/v1/tier/lotes/${id}`, body);
  return unwrapData(res.data);
}

export async function deleteLote(id: string): Promise<{ id: string }> {
  const res = await http.delete<ApiEnvelope<{ id: string }>>(`/v1/tier/lotes/${id}`);
  return unwrapData(res.data);
}

export async function addLoteOrigem(loteId: string, fazendaId: string): Promise<unknown> {
  const res = await http.post<ApiEnvelope<unknown>>(`/v1/tier/lotes/${loteId}/origens/${fazendaId}`);
  return unwrapData(res.data);
}

export async function removeLoteOrigem(loteId: string, fazendaId: string): Promise<unknown> {
  const res = await http.delete<ApiEnvelope<unknown>>(`/v1/tier/lotes/${loteId}/origens/${fazendaId}`);
  return unwrapData(res.data);
}

export async function addLoteGta(loteId: string, gtaId: string): Promise<unknown> {
  const res = await http.post<ApiEnvelope<unknown>>(`/v1/tier/lotes/${loteId}/gtas/${gtaId}`);
  return unwrapData(res.data);
}

export async function removeLoteGta(loteId: string, gtaId: string): Promise<unknown> {
  const res = await http.delete<ApiEnvelope<unknown>>(`/v1/tier/lotes/${loteId}/gtas/${gtaId}`);
  return unwrapData(res.data);
}

// ---- Documentos ----
export async function listDocumentos(params: {
  escopo?: string;
  refId?: string;
  loteId?: string;
}): Promise<Documento[]> {
  const res = await http.get<ApiEnvelope<Documento[]>>("/v1/tier/documentos", {
    params,
  });
  return unwrapData(res.data);
}

// form must contain: file, tipo, escopo, refId, and optionally loteId, dataRef.
export async function uploadDocumento(form: FormData): Promise<Documento> {
  const res = await http.post<ApiEnvelope<Documento>>("/v1/tier/documentos", form);
  return unwrapData(res.data);
}

export async function deleteDocumento(id: string): Promise<{ id: string }> {
  const res = await http.delete<ApiEnvelope<{ id: string }>>(`/v1/tier/documentos/${id}`);
  return unwrapData(res.data);
}

// ---- Gtas ----
export async function listGtas(search?: string): Promise<Gta[]> {
  const res = await http.get<ApiEnvelope<Gta[]>>("/v1/tier/gtas", {
    params: { search },
  });
  return unwrapData(res.data);
}

export async function extractGta(form: FormData): Promise<GtaExtractionResult> {
  const res = await http.post<ApiEnvelope<GtaExtractionResult>>("/v1/tier/gtas/extract", form);
  return unwrapData(res.data);
}

// form: PDF (optional) + edited fields (numero required).
export async function createGta(form: FormData): Promise<Gta & { _deduped?: boolean }> {
  const res = await http.post<ApiEnvelope<Gta & { _deduped?: boolean }>>("/v1/tier/gtas", form);
  return unwrapData(res.data);
}

export async function updateGta(id: string, body: Partial<Gta>): Promise<Gta> {
  const res = await http.put<ApiEnvelope<Gta>>(`/v1/tier/gtas/${id}`, body);
  return unwrapData(res.data);
}

export async function deleteGta(id: string): Promise<{ id: string }> {
  const res = await http.delete<ApiEnvelope<{ id: string }>>(`/v1/tier/gtas/${id}`);
  return unwrapData(res.data);
}

// ---- Abates ----
export async function listAbates(): Promise<Abate[]> {
  const res = await http.get<ApiEnvelope<Abate[]>>("/v1/tier/abates");
  return unwrapData(res.data);
}

export async function createAbate(body: {
  proprietarioId: string;
  dataAbate: string;
  frigorificoId?: string;
  qtd: number;
  consumos?: { tierId: string; qtdConsumida: number }[];
}): Promise<Abate> {
  const res = await http.post<ApiEnvelope<Abate>>("/v1/tier/abates", body);
  return unwrapData(res.data);
}

export async function deleteAbate(id: string): Promise<{ id: string }> {
  const res = await http.delete<ApiEnvelope<{ id: string }>>(`/v1/tier/abates/${id}`);
  return unwrapData(res.data);
}

export async function listConsumosByTier(tierId: string): Promise<AbateConsumo[]> {
  const res = await http.get<ApiEnvelope<AbateConsumo[]>>(`/v1/tier/abates/by-tier/${tierId}`);
  return unwrapData(res.data);
}
