<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="text-2xl font-semibold">Agendamento</div>
        <div class="text-sm text-muted-foreground">
          Configure análises recorrentes (completa ou DETER preventiva).
        </div>
      </div>
      <UiButton variant="outline" size="sm" :disabled="loading" @click="reloadAll">
        Atualizar
      </UiButton>
    </header>

    <section class="grid gap-4 lg:grid-cols-2">
      <article class="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div class="text-lg font-semibold">Novo agendamento</div>
        <div class="mt-4 grid gap-3">
          <div class="grid gap-2">
            <UiLabel for="schedule-farm">Fazenda</UiLabel>
            <UiSelect id="schedule-farm" v-model="form.farmId" data-testid="schedule-farm-select">
              <option value="" disabled>Selecione a fazenda</option>
              <option v-for="farm in farms" :key="farm.id" :value="farm.id">
                {{ farm.name }}
              </option>
            </UiSelect>
          </div>

          <div class="grid gap-2">
            <UiLabel for="schedule-kind">Tipo de análise</UiLabel>
            <UiSelect id="schedule-kind" v-model="form.analysisKind" data-testid="schedule-kind-select">
              <option value="STANDARD">STANDARD</option>
              <option value="DETER">DETER</option>
            </UiSelect>
          </div>

          <div class="grid gap-2">
            <UiLabel for="schedule-frequency">Frequência</UiLabel>
            <UiSelect
              id="schedule-frequency"
              v-model="form.frequency"
              data-testid="schedule-frequency-select"
            >
              <option value="WEEKLY">WEEKLY</option>
              <option value="BIWEEKLY">BIWEEKLY</option>
              <option value="MONTHLY">MONTHLY</option>
            </UiSelect>
          </div>

          <UiButton :disabled="saving" data-testid="schedule-create" @click="createSchedule">
            <span v-if="saving">Salvando...</span>
            <span v-else>Criar agendamento</span>
          </UiButton>

          <div v-if="message" class="text-xs text-muted-foreground">
            {{ message }}
          </div>
        </div>
      </article>

      <article class="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div class="flex items-center justify-between">
          <div class="text-lg font-semibold">Agendamentos ativos</div>
          <div class="text-xs text-muted-foreground">{{ schedules.length }} itens</div>
        </div>

        <div v-if="loading" class="mt-4 space-y-3" data-testid="schedules-skeleton">
          <UiSkeleton class="h-16 w-full rounded-xl" />
          <UiSkeleton class="h-16 w-full rounded-xl" />
          <UiSkeleton class="h-16 w-full rounded-xl" />
        </div>

        <div v-else class="mt-4 space-y-3">
          <div v-if="error" class="text-sm text-red-500">{{ error }}</div>
          <div v-else-if="schedules.length === 0" class="text-sm text-muted-foreground">
            Nenhum agendamento configurado.
          </div>
          <div
            v-for="schedule in schedules"
            :key="schedule.id"
            class="rounded-xl border border-border bg-background p-4"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div class="font-semibold">{{ schedule.farmName ?? 'Fazenda sem nome' }}</div>
                <div class="text-xs text-muted-foreground">
                  {{ kindLabel(schedule.analysisKind) }} ·
                  {{ frequencyLabel(schedule.frequency) }} ·
                  Próxima execução: {{ formatDateTime(schedule.nextRunAt) }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span
                  class="rounded-full border px-2 py-1 text-xs"
                  :class="
                    schedule.isActive
                      ? 'border-emerald-200 text-emerald-700'
                      : 'border-zinc-200 text-zinc-600'
                  "
                >
                  {{ schedule.isActive ? 'Ativo' : 'Pausado' }}
                </span>
                <UiButton
                  size="sm"
                  variant="outline"
                  @click="toggleSchedule(schedule)"
                >
                  {{ schedule.isActive ? 'Pausar' : 'Reativar' }}
                </UiButton>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Button as UiButton, Label as UiLabel, Select as UiSelect, Skeleton as UiSkeleton } from '@/components/ui';
import { http } from '@/api/http';
import { unwrapData, unwrapPaged, type ApiEnvelope } from '@/api/envelope';

type AnalysisKind = 'STANDARD' | 'DETER';
type ScheduleFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

type Farm = {
  id: string;
  name: string;
};

type Schedule = {
  id: string;
  farmId: string;
  farmName: string | null;
  analysisKind: AnalysisKind;
  frequency: ScheduleFrequency;
  isActive: boolean;
  nextRunAt: string;
  lastRunAt?: string | null;
};

const farms = ref<Farm[]>([]);
const schedules = ref<Schedule[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const message = ref('');

const form = reactive<{ farmId: string; analysisKind: AnalysisKind; frequency: ScheduleFrequency }>({
  farmId: '',
  analysisKind: 'STANDARD',
  frequency: 'WEEKLY',
});

function kindLabel(kind: AnalysisKind) {
  if (kind === 'DETER') return 'DETER preventiva';
  return 'Análise completa';
}

function frequencyLabel(frequency: ScheduleFrequency) {
  if (frequency === 'WEEKLY') return 'Semanal';
  if (frequency === 'BIWEEKLY') return 'Quinzenal';
  return 'Mensal';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

async function loadFarms() {
  const res = await http.get<ApiEnvelope<Farm[]>>('/v1/farms', {
    params: { page: 1, pageSize: 100 },
  });
  farms.value = unwrapPaged(res.data).rows;
  if (!form.farmId && farms.value.length > 0) {
    form.farmId = farms.value[0]?.id ?? '';
  }
}

async function loadSchedules() {
  const res = await http.get<ApiEnvelope<Schedule[]>>('/v1/schedules', {
    params: { page: 1, pageSize: 50 },
  });
  schedules.value = unwrapPaged(res.data).rows;
}

async function reloadAll() {
  loading.value = true;
  error.value = '';
  try {
    await Promise.all([loadFarms(), loadSchedules()]);
  } catch (err: any) {
    error.value =
      err?.response?.data?.error?.message ??
      err?.response?.data?.message ??
      'Falha ao carregar agendamentos.';
  } finally {
    loading.value = false;
  }
}

async function createSchedule() {
  message.value = '';
  error.value = '';
  if (!form.farmId) {
    message.value = 'Selecione uma fazenda.';
    return;
  }

  saving.value = true;
  try {
    const res = await http.post<ApiEnvelope<Schedule>>('/v1/schedules', {
      farmId: form.farmId,
      analysisKind: form.analysisKind,
      frequency: form.frequency,
    });
    const created = unwrapData(res.data);
    message.value = `Agendamento criado para ${created.farmName ?? 'fazenda selecionada'}.`;
    await loadSchedules();
  } catch (err: any) {
    message.value =
      err?.response?.data?.error?.message ??
      err?.response?.data?.message ??
      'Falha ao criar agendamento.';
  } finally {
    saving.value = false;
  }
}

async function toggleSchedule(schedule: Schedule) {
  try {
    if (schedule.isActive) {
      await http.post(`/v1/schedules/${schedule.id}/pause`);
    } else {
      await http.post(`/v1/schedules/${schedule.id}/resume`);
    }
    await loadSchedules();
  } catch {
    error.value = 'Falha ao atualizar status do agendamento.';
  }
}

onMounted(() => {
  void reloadAll();
});
</script>
