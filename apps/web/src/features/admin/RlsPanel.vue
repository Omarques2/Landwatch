<!-- apps/web/src/features/admin/RlsPanel.vue -->
<template>
  <section class="space-y-4">
    <RlsDatasetCard
      v-model:dataset-id="datasetId"
      :datasets="datasets"
      :selected-dataset="selectedDataset"
      :loading="loadingDatasets"
      :error="datasetsError"
      @refresh="refresh"
    />

    <div v-if="targetModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        class="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl
               dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {{ targetEditing ? "Editar target" : "Novo target" }}
            </div>
            <div class="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Defina a coluna base que sera usada no filtro RLS.
            </div>
          </div>
          <UiButton
            type="button"
            variant="outline"
            size="sm"
            class="h-8 px-3 text-xs"
            :disabled="savingTarget"
            @click="closeTargetModal"
          >
            Fechar
          </UiButton>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-3">
          <div>
            <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Display name</label>
            <UiInput
              v-model="targetForm.displayName"
              class="mt-1 w-full"
              :disabled="savingTarget"
              placeholder="ex: Instituicao Financeira"
              @blur="fillTargetKeyFromName"
            />
          </div>

          <div>
            <label class="text-xs font-medium text-slate-700 dark:text-slate-300">target_key</label>
            <UiInput
              v-model="targetForm.targetKey"
              class="mt-1 w-full"
              :disabled="savingTarget"
              placeholder="ex: instituicao_financeira"
            />
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Fact table</label>
              <UiInput
                v-model="targetForm.factTable"
                class="mt-1 w-full"
                :disabled="savingTarget"
                placeholder="ex: LoteFormacao_2"
              />
            </div>
            <div>
              <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Fact column</label>
              <UiInput
                v-model="targetForm.factColumn"
                class="mt-1 w-full"
                :disabled="savingTarget"
                placeholder="ex: Instituicao Financeira"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Value type</label>
              <UiSelect
                v-model="targetForm.valueType"
                class="mt-1 w-full"
                :disabled="savingTarget"
              >
                <option value="text">text</option>
                <option value="int">int</option>
                <option value="uuid">uuid</option>
              </UiSelect>
            </div>

            <div>
              <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Default behavior</label>
              <UiSelect
                v-model="targetForm.defaultBehavior"
                class="mt-1 w-full"
                :disabled="savingTarget"
              >
                <option value="allow">allow</option>
                <option value="deny">deny</option>
              </UiSelect>
            </div>

            <div>
              <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Status</label>
              <UiSelect
                v-model="targetForm.status"
                class="mt-1 w-full"
                :disabled="savingTarget"
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
              </UiSelect>
            </div>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-end gap-2">
          <UiButton
            type="button"
            variant="outline"
            size="md"
            class="h-9 px-4 text-sm"
            :disabled="savingTarget"
            @click="closeTargetModal"
          >
            Cancelar
          </UiButton>

          <UiButton
            type="button"
            variant="default"
            size="md"
            class="h-9 px-4 text-sm"
            :disabled="savingTarget || !canSaveTarget"
            @click="saveTarget"
          >
            {{ savingTarget ? "Salvando..." : "Salvar" }}
          </UiButton>
        </div>
      </div>
    </div>

    <div v-if="ruleModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        class="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl
               dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">Nova regra</div>
            <div class="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Informe o escopo e os valores permitidos/negados.
            </div>
          </div>
          <UiButton
            type="button"
            variant="outline"
            size="sm"
            class="h-8 px-3 text-xs"
            :disabled="ruleModalSaving"
            @click="closeRuleModal"
          >
            Fechar
          </UiButton>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div>
            <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Target</label>
            <UiSelect
              v-model="ruleForm.targetId"
              class="mt-1 w-full"
            >
              <option value="">-- selecione --</option>
              <option v-for="t in targets" :key="t.id" :value="t.id">
                {{ t.displayName }} ({{ t.targetKey }})
              </option>
            </UiSelect>
            <div class="mt-1 text-[11px] text-muted-foreground">
              value_type: {{ ruleFormTarget?.valueType || "-" }}
            </div>
          </div>

          <div>
            <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Escopo</label>
            <UiSelect
              v-model="ruleForm.scope"
              class="mt-1 w-full"
            >
              <option value="customer">Customer</option>
              <option value="user">Usuario</option>
            </UiSelect>
          </div>

          <div>
            <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Entidade</label>
            <UiSelect
              v-if="ruleForm.scope === 'customer'"
              v-model="ruleForm.customerId"
              class="mt-1 w-full"
            >
              <option value="">-- selecione --</option>
              <option v-for="c in customers" :key="c.id" :value="c.id">
                {{ c.code }} - {{ c.name }}
              </option>
            </UiSelect>
            <UiSelect
              v-else
              v-model="ruleForm.userId"
              class="mt-1 w-full"
            >
              <option value="">-- selecione --</option>
              <option v-for="u in activeUsers" :key="u.id" :value="u.id">
                {{ u.display_name || u.email || u.id }}
              </option>
            </UiSelect>
          </div>

          <div>
            <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Operacao</label>
            <UiSelect
              v-model="ruleForm.op"
              class="mt-1 w-full"
            >
              <option value="include">include</option>
              <option value="exclude">exclude</option>
            </UiSelect>
          </div>
        </div>

        <div class="mt-3">
          <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Valores</label>
          <UiTextarea
            v-model="ruleForm.values"
            :rows="3"
            class="mt-1 w-full"
            :placeholder="ruleValuesPlaceholder"
          />
          <div class="mt-1 text-[11px] text-muted-foreground">
            Separe por virgula, ponto e virgula ou quebra de linha.
          </div>
        </div>

        <div v-if="ruleModalError" class="mt-2 text-xs text-rose-600 dark:text-rose-300">
          {{ ruleModalError }}
        </div>

        <div v-if="usersError" class="mt-2 text-xs text-amber-600 dark:text-amber-300">
          Falha ao carregar usuarios: {{ usersError }}
        </div>

        <div class="mt-4 flex items-center justify-end gap-2">
          <UiButton
            type="button"
            variant="outline"
            size="sm"
            class="h-8 px-3 text-xs"
            :disabled="ruleModalSaving"
            @click="closeRuleModal"
          >
            Cancelar
          </UiButton>
          <UiButton
            type="button"
            variant="default"
            size="sm"
            class="h-8 px-3 text-xs"
            :disabled="ruleModalSaving || !canSaveRule"
            @click="saveRuleModal"
          >
            {{ ruleModalSaving ? "Salvando..." : "Salvar regra" }}
          </UiButton>
        </div>
      </div>
    </div>

    <PanelCard>
    <UiTabs v-model="activeTab" :tabs="tabs" />

      <div class="mt-4">
        <!-- TAB: TARGETS -->
        <div v-if="activeTab === 'targets'">
          <div
            v-if="!datasetId"
            class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700
                   dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
          >
            Selecione um dataset para cadastrar targets.
          </div>

          <div v-else>
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">Targets</div>
                <div class="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Defina colunas elegiveis para gerar dimensoes e regras de acesso.
                </div>
              </div>

              <UiButton
                type="button"
                variant="default"
                size="sm"
                class="h-8 px-3 text-xs"
                :disabled="!datasetId"
                @click="openTargetCreate"
              >
                + Novo target
              </UiButton>
            </div>

            <div
              v-if="targetsError"
              class="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700
                     dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
            >
              {{ targetsError }}
            </div>

            <div
              v-if="loadingTargets"
              class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700
                     dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
            >
              Carregando targets...
            </div>

            <div v-if="!loadingTargets" class="mt-3">
              <div class="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table class="w-full table-fixed text-left text-sm">
                  <thead class="bg-slate-50 text-xs text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
                    <tr>
                      <th class="w-40 px-4 py-3">target_key</th>
                      <th class="px-4 py-3">Display</th>
                      <th class="w-40 px-4 py-3">Fact</th>
                      <th class="w-24 px-4 py-3">Type</th>
                      <th class="w-24 px-4 py-3">Status</th>
                      <th class="w-40 px-4 py-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                    <tr v-for="t in targets" :key="t.id" class="hover:bg-slate-50/60 dark:hover:bg-slate-950/30">
                      <td class="px-4 py-3 font-mono text-xs text-slate-900 dark:text-slate-100">
                        <div class="truncate">{{ t.targetKey }}</div>
                      </td>
                      <td class="px-4 py-3 text-slate-900 dark:text-slate-100">
                        <div class="truncate">{{ t.displayName }}</div>
                      </td>
                      <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">
                        <div class="truncate">{{ t.factTable }}.{{ t.factColumn }}</div>
                      </td>
                      <td class="px-4 py-3">
                        <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
                          {{ t.valueType }}
                        </span>
                      </td>
                      <td class="px-4 py-3">
                        <span
                          class="inline-flex items-center rounded-full border px-2 py-1 text-[11px]"
                          :class="t.status === 'active'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
                            : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200'"
                        >
                          {{ t.status }}
                        </span>
                      </td>
                      <td class="px-4 py-3">
                        <div class="flex items-center justify-end gap-2">
                          <UiButton
                            type="button"
                            variant="outline"
                            size="sm"
                            class="h-8 px-3 text-xs"
                            :disabled="targetBusy.isBusy(t.id)"
                            @click="openTargetEdit(t)"
                          >
                            Editar
                          </UiButton>
                          <UiButton
                            type="button"
                            variant="destructive"
                            size="sm"
                            class="h-8 px-3 text-xs"
                            :disabled="targetBusy.isBusy(t.id)"
                            @click="removeTarget(t)"
                          >
                            {{ targetBusy.isBusy(t.id) ? "..." : "Excluir" }}
                          </UiButton>
                        </div>
                      </td>
                    </tr>

                    <tr v-if="!targets.length">
                      <td colspan="6" class="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        Nenhum target cadastrado.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB: RULES -->
        <div v-else-if="activeTab === 'rules'">
          <div
            v-if="!datasetId"
            class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700
                   dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
          >
            Selecione um dataset para cadastrar regras.
          </div>

          <div
            v-else-if="!targets.length"
            class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700
                   dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
          >
            Crie ao menos um target antes de cadastrar regras.
          </div>

          <div v-else>
            <div class="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <div>
                <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Target</label>
                <UiSelect v-model="selectedTargetId" class="mt-1 w-full">
                  <option v-for="t in targets" :key="t.id" :value="t.id">
                    {{ t.displayName }} ({{ t.targetKey }})
                  </option>
                </UiSelect>
                <div class="mt-1 text-[11px] text-muted-foreground">
                  value_type: {{ selectedTarget?.valueType || "-" }}
                </div>
              </div>

              <div>
                <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Filtro</label>
                <UiSelect v-model="rulesFilterScope" class="mt-1 w-full">
                  <option value="all">-- todos --</option>
                  <option value="customer">Customer</option>
                  <option value="user">Usuario</option>
                </UiSelect>
              </div>

              <div>
                <label class="text-xs font-medium text-slate-700 dark:text-slate-300">Entidade</label>
                <UiSelect
                  v-if="rulesFilterScope === 'customer'"
                  v-model="rulesFilterCustomerId"
                  class="mt-1 w-full"
                >
                  <option value="">-- todas --</option>
                  <option v-for="c in customers" :key="c.id" :value="c.id">
                    {{ c.code }} - {{ c.name }}
                  </option>
                </UiSelect>
                <UiSelect
                  v-else-if="rulesFilterScope === 'user'"
                  v-model="rulesFilterUserId"
                  class="mt-1 w-full"
                >
                  <option value="">-- todos --</option>
                  <option v-for="u in activeUsers" :key="u.id" :value="u.id">
                    {{ u.display_name || u.email || u.id }}
                  </option>
                </UiSelect>
                <div v-else class="mt-3 text-[11px] text-muted-foreground">
                  Selecione um filtro.
                </div>
              </div>

              <div class="flex items-end justify-end">
                <UiButton
                  type="button"
                  variant="default"
                  size="sm"
                  class="h-8 px-3 text-xs"
                  :disabled="ruleModalSaving"
                  @click="openRuleCreate"
                >
                  + Nova regra
                </UiButton>
              </div>
            </div>
            <div v-if="rulesError" class="mt-3 text-xs text-rose-600 dark:text-rose-300">
              {{ rulesError }}
            </div>

            <div
              v-if="loadingRules"
              class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700
                     dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
            >
              Carregando regras...
            </div>

            <div v-if="!loadingRules" class="mt-3 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table class="w-full table-fixed text-left text-sm">
                <thead class="bg-slate-50 text-xs text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
                  <tr>
                    <th class="w-28 px-4 py-3">Escopo</th>
                    <th class="w-60 px-4 py-3">Entidade</th>
                    <th class="w-24 px-4 py-3">Op</th>
                    <th class="px-4 py-3">Valor</th>
                    <th class="w-32 px-4 py-3">Criado</th>
                    <th class="w-28 px-4 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                  <tr v-for="r in rules" :key="r.id" class="hover:bg-slate-50/60 dark:hover:bg-slate-950/30">
                    <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">
                      {{ r.customerId ? "customer" : "user" }}
                    </td>
                    <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">
                      <div class="truncate">{{ ruleOwnerLabel(r) }}</div>
                      <div class="font-mono text-[10px] text-slate-400 dark:text-slate-500">{{ ruleOwnerId(r) }}</div>
                    </td>
                    <td class="px-4 py-3">
                      <span
                        class="inline-flex items-center rounded-full border px-2 py-1 text-[11px]"
                        :class="r.op === 'include'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
                          : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200'"
                      >
                        {{ r.op }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-slate-900 dark:text-slate-100">
                      <div class="truncate">{{ formatRuleValue(r) }}</div>
                    </td>
                    <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {{ fmtDate(r.createdAt) }}
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-center justify-end">
                        <UiButton
                          type="button"
                          variant="destructive"
                          size="sm"
                          class="h-8 px-3 text-xs"
                          :disabled="ruleBusy.isBusy(r.id)"
                          @click="removeRule(r)"
                        >
                          {{ ruleBusy.isBusy(r.id) ? "..." : "Excluir" }}
                        </UiButton>
                      </div>
                    </td>
                  </tr>

                  <tr v-if="!rules.length">
                    <td colspan="6" class="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      Nenhuma regra encontrada.
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
        </div>
        
        <!-- TAB: GUIDE -->
        <div v-else-if="activeTab === 'guide'">
          <div
            v-if="!datasetId"
            class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700
                   dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
          >
            Selecione um dataset para gerar o guia PBIX.
          </div>

          <div
            v-else-if="!targets.length"
            class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700
                   dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
          >
            Nenhum target cadastrado. Crie targets para gerar o guia.
          </div>

          <div v-else class="space-y-4">
            <div>
              <div class="flex items-center justify-between">
                <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">Targets</div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400">
                  Clique em um card para abrir o tutorial completo.
                </div>
              </div>

              <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <button
                  v-for="t in targets"
                  :key="t.id"
                  type="button"
                  class="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md
                         dark:border-slate-800 dark:bg-slate-900"
                  @click="openGuide(t)"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {{ t.displayName }}
                      </div>
                      <div class="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {{ t.targetKey }}
                      </div>
                    </div>
                    <span
                      class="shrink-0 rounded-full border px-2 py-1 text-[10px]"
                      :class="t.status === 'active'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
                        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200'"
                    >
                      {{ t.status }}
                    </span>
                  </div>

                  <div class="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                    Fact: <span class="font-mono">{{ t.factTable }}.{{ t.factColumn }}</span>
                  </div>

                  <div class="mt-3 flex items-center justify-between">
                    <span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
                      value_type: {{ t.valueType }}
                    </span>
                    <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-900 group-hover:underline dark:text-slate-100">
                      Abrir tutorial -></span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB: SNAPSHOT -->
        <div v-else-if="activeTab === 'snapshot'">
          <div
            v-if="!datasetId"
            class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700
                   dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
          >
            Selecione um dataset para exportar snapshot.
          </div>

          <div v-else class="space-y-3">
            <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">Snapshot do dataset</div>
                  <div class="text-xs text-slate-600 dark:text-slate-300">
                    Exporta targets e regras para auditoria (JSON/CSV).
                  </div>
                </div>
                <UiButton
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-8 px-3 text-xs"
                  :disabled="snapshotLoading"
                  @click="loadSnapshot"
                >
                  {{ snapshotLoading ? "Gerando..." : "Gerar snapshot" }}
                </UiButton>
              </div>

              <div v-if="snapshotError" class="mt-2 text-xs text-rose-600 dark:text-rose-300">
                {{ snapshotError }}
              </div>

              <div v-else-if="snapshot" class="mt-3 grid grid-cols-1 gap-2 text-[11px] text-slate-500 dark:text-slate-400 sm:grid-cols-3">
                <div>
                  <span class="font-semibold text-slate-900 dark:text-slate-100">Targets:</span>
                  {{ snapshotCounts.targets }}
                </div>
                <div>
                  <span class="font-semibold text-slate-900 dark:text-slate-100">Regras:</span>
                  {{ snapshotCounts.rules }}
                </div>
                <div>
                  <span class="font-semibold text-slate-900 dark:text-slate-100">Gerado:</span>
                  {{ fmtDate(snapshot.generatedAt) }}
                </div>
              </div>
            </div>

            <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div class="text-xs font-semibold text-slate-900 dark:text-slate-100">Exportar</div>
              <div class="mt-2 flex flex-wrap gap-2">
                <UiButton
                  type="button"
                  variant="default"
                  size="sm"
                  class="h-8 px-3 text-xs"
                  :disabled="snapshotExporting !== ''"
                  @click="exportSnapshot('json')"
                >
                  {{ snapshotExporting === "json" ? "Exportando..." : "Exportar JSON" }}
                </UiButton>
                <UiButton
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-8 px-3 text-xs"
                  :disabled="snapshotExporting !== ''"
                  @click="exportSnapshot('csv')"
                >
                  {{ snapshotExporting === "csv" ? "Exportando..." : "Exportar CSV" }}
                </UiButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PanelCard>

    <!-- MODAL guide -->
    <div v-if="guideModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div class="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div class="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Guia PBIX - {{ guideTarget?.displayName || "Target" }}
            </div>
            <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Target: <span class="font-mono">{{ guideTarget?.targetKey }}</span>
              <span class="mx-1">-</span>
              Fact: <span class="font-mono">{{ guideTarget?.factTable }}.{{ guideTarget?.factColumn }}</span>
            </div>
          </div>

          <UiButton
            type="button"
            variant="outline"
            size="sm"
            class="h-8 px-3 text-xs"
            @click="closeGuide"
          >
            Fechar
          </UiButton>
        </div>

        <div class="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div class="flex items-center gap-3">
            <div class="text-[11px] text-slate-500 dark:text-slate-400">
              Passo {{ guideStepIndex + 1 }} de {{ guideSteps.length }}
            </div>
            <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                class="h-full rounded-full bg-slate-900 transition-all dark:bg-slate-100"
                :style="{ width: guideSteps.length ? `${Math.round(((guideStepIndex + 1) / guideSteps.length) * 100)}%` : '0%' }"
              />
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="currentGuideStep" class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">{{ currentGuideStep.title }}</div>
            <div v-if="currentGuideStep.subtitle" class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {{ currentGuideStep.subtitle }}
            </div>

            <ol v-if="currentGuideStep.bullets?.length" class="mt-3 list-decimal space-y-1 pl-4">
              <li v-for="(b, i) in currentGuideStep.bullets" :key="i">{{ b }}</li>
            </ol>

            <ul v-if="currentGuideStep.tips?.length" class="mt-3 space-y-1">
              <li v-for="(tip, i) in currentGuideStep.tips" :key="i" class="flex items-start gap-2">
                <span class="mt-[2px] inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white dark:bg-slate-100 dark:text-slate-900">i</span>
                <span>{{ tip }}</span>
              </li>
            </ul>

            <div v-if="currentGuideStep.links?.length" class="mt-3 flex flex-wrap gap-2">
              <a
                v-for="(link, i) in currentGuideStep.links"
                :key="i"
                :href="link.href"
                target="_blank"
                rel="noreferrer"
                class="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-700 hover:bg-slate-50
                       dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {{ link.label }} ->
              </a>
            </div>

            <div v-if="currentGuideStep.showDax && guideTarget" class="mt-4">
              <div class="flex items-center justify-between">
                <div class="text-[11px] font-semibold text-slate-700 dark:text-slate-200">DAX da role</div>
                <UiButton
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-7 px-2 text-[11px]"
                  @click="copyGuideDax"
                >
                  Copiar DAX
                </UiButton>
              </div>
              <pre class="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">{{ daxForTarget(guideTarget) }}</pre>
            </div>

            <div class="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div class="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Print sugerido</div>
              <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{{ currentGuideStep.screenshotHint }}</div>
              <div class="mt-3 grid h-36 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                Adicione um screenshot aqui
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between border-t border-slate-200 p-4 dark:border-slate-800">
          <div class="text-[11px] text-slate-500 dark:text-slate-400">
            {{ currentGuideStep?.title || "" }}
          </div>
          <div class="flex items-center gap-2">
            <UiButton
              type="button"
              variant="outline"
              size="sm"
              class="h-8 px-3 text-xs"
              :disabled="guideStepIndex === 0"
              @click="guideStepIndex = Math.max(guideStepIndex - 1, 0)"
            >
              Anterior
            </UiButton>
            <UiButton
              type="button"
              variant="default"
              size="sm"
              class="h-8 px-3 text-xs"
              :disabled="guideSteps.length === 0"
              @click="nextGuideStep"
            >
              {{ guideStepIndex >= guideSteps.length - 1 ? "Concluir" : "Proximo" }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>

  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import type { ActiveUserRow, CustomerRow, RlsDatasetSummary } from "@/features/admin/api";
import { listActiveUsers } from "@/features/admin/api";
import {
  type CreateRulePayload,
  type CreateTargetPayload,
  type RlsRule,
  type RlsRuleOp,
  type RlsSnapshot,
  type RlsTarget,
  type RlsTargetStatus,
  type RlsValueType,
  type RlsDefaultBehavior,
  createRlsRules,
  createRlsTarget,
  deleteRlsRule,
  deleteRlsTarget,
  getRlsSnapshot,
  getRlsSnapshotCsv,
  listRlsDatasets,
  listRlsRules,
  listRlsTargets,
  refreshRlsDataset,
  updateRlsTarget,
} from "@/features/admin/api/rls";
import PanelCard from "@/ui/PanelCard.vue";
import RlsDatasetCard from "@/features/admin/rls/RlsDatasetCard.vue";
import { useConfirm } from "@/ui/confirm/useConfirm";
import { useBusyMap } from "@/ui/ops/useBusyMap";
import { normalizeApiError } from "@/ui/ops/normalizeApiError";
import { useToast } from "@/ui/toast/useToast";
import {
  Button as UiButton,
  Input as UiInput,
  Select as UiSelect,
  Tabs as UiTabs,
  Textarea as UiTextarea,
} from "@/components/ui";

const props = defineProps<{
  customers: CustomerRow[];
}>();

const { confirm } = useConfirm();
const { push } = useToast();

const activeTab = ref<"targets" | "rules" | "guide" | "snapshot">("targets");
const tabs = [
  { key: "targets", label: "Targets" },
  { key: "rules", label: "Regras" },
  { key: "guide", label: "Guia PBIX" },
  { key: "snapshot", label: "Snapshot" },
];
const targetModalOpen = ref(false);
const ruleModalOpen = ref(false);

// =====================
// Guide modal
// =====================
type GuideStep = {
  key: string;
  title: string;
  subtitle?: string;
  bullets: string[];
  tips?: string[];
  links?: Array<{ label: string; href: string }>;
  showDax?: boolean;
  screenshotHint: string;
};

const guideModalOpen = ref(false);
const guideTarget = ref<RlsTarget | null>(null);
const guideStepIndex = ref(0);

const guideSteps = computed<GuideStep[]>(() => {
  if (!guideTarget.value) return [];
  return buildGuideSteps(guideTarget.value);
});

const currentGuideStep = computed(() => guideSteps.value[guideStepIndex.value] ?? null);

function openGuide(t: RlsTarget) {
  guideTarget.value = t;
  guideStepIndex.value = 0;
  guideModalOpen.value = true;
}

function closeGuide() {
  guideModalOpen.value = false;
  guideTarget.value = null;
}

function nextGuideStep() {
  if (guideStepIndex.value >= guideSteps.value.length - 1) {
    closeGuide();
    return;
  }
  guideStepIndex.value += 1;
}

async function copyGuideDax() {
  if (!guideTarget.value) return;
  const text = daxForTarget(guideTarget.value);

  try {
    if (!navigator?.clipboard?.writeText) {
      throw new Error("Clipboard API not available");
    }
    await navigator.clipboard.writeText(text);
    push({ kind: "success", title: "DAX copiado" });
  } catch {
    push({ kind: "error", title: "Falha ao copiar DAX", message: "Copie manualmente o bloco de DAX." });
  }
}

// =====================
// Dataset selection
// =====================
const datasets = ref<RlsDatasetSummary[]>([]);
const datasetId = ref<string>("");
const loadingDatasets = ref(false);
const datasetsError = ref("");

const customers = computed(() => props.customers ?? []);

const activeUsers = ref<ActiveUserRow[]>([]);
const loadingUsers = ref(false);
const usersError = ref("");

async function loadActiveUsers() {
  if (loadingUsers.value) return;
  loadingUsers.value = true;
  usersError.value = "";

  try {
    const res = await listActiveUsers("", 1, 100);
    activeUsers.value = res.rows.map((row: any) => ({
      ...row,
      display_name: row.display_name ?? row.displayName ?? null,
    }));
  } catch (e: any) {
    const ne = normalizeApiError(e);
    usersError.value = ne.message;
  } finally {
    loadingUsers.value = false;
  }
}

const selectedDataset = computed(() =>
  datasets.value.find((d) => d.datasetId === datasetId.value) ?? null
);

async function loadDatasets() {
  if (loadingDatasets.value) return;
  loadingDatasets.value = true;
  datasetsError.value = "";

  try {
    const res = await listRlsDatasets();
    datasets.value = res.items;
    if (!datasetId.value || !res.items.some((d) => d.datasetId === datasetId.value)) {
      datasetId.value = res.items[0]?.datasetId ?? "";
    }
  } catch (e: any) {
    const ne = normalizeApiError(e);
    datasetsError.value = ne.message;
    push({
      kind: "error",
      title: "Falha ao carregar datasets",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    loadingDatasets.value = false;
  }
}

// =====================
// Targets
// =====================
const targets = ref<RlsTarget[]>([]);
const loadingTargets = ref(false);
const targetsError = ref("");
const targetBusy = useBusyMap();

const targetEditing = ref<RlsTarget | null>(null);
const savingTarget = ref(false);

const targetForm = reactive<{
  targetKey: string;
  displayName: string;
  factTable: string;
  factColumn: string;
  valueType: RlsValueType;
  defaultBehavior: RlsDefaultBehavior;
  status: RlsTargetStatus;
}>(
  {
    targetKey: "",
    displayName: "",
    factTable: "",
    factColumn: "",
    valueType: "text",
    defaultBehavior: "allow",
    status: "draft",
  }
);

const canSaveTarget = computed(() => {
  return (
    !!datasetId.value &&
    targetForm.targetKey.trim().length >= 2 &&
    targetForm.displayName.trim().length >= 2 &&
    targetForm.factTable.trim().length >= 1 &&
    targetForm.factColumn.trim().length >= 1
  );
});

async function loadTargets() {
  if (!datasetId.value) {
    targets.value = [];
    return;
  }

  loadingTargets.value = true;
  targetsError.value = "";

  try {
    const res = await listRlsTargets(datasetId.value);
    targets.value = res.items;
  } catch (e: any) {
    const ne = normalizeApiError(e);
    targetsError.value = ne.message;
    push({
      kind: "error",
      title: "Falha ao carregar targets",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    loadingTargets.value = false;
  }
}

function openTargetCreate() {
  targetEditing.value = null;
  targetForm.targetKey = "";
  targetForm.displayName = "";
  targetForm.factTable = "";
  targetForm.factColumn = "";
  targetForm.valueType = "text";
  targetForm.defaultBehavior = "allow";
  targetForm.status = "draft";
  targetModalOpen.value = true;
}

function openTargetEdit(t: RlsTarget) {
  targetEditing.value = t;
  targetForm.targetKey = t.targetKey;
  targetForm.displayName = t.displayName;
  targetForm.factTable = t.factTable;
  targetForm.factColumn = t.factColumn;
  targetForm.valueType = t.valueType;
  targetForm.defaultBehavior = t.defaultBehavior;
  targetForm.status = t.status;
  targetModalOpen.value = true;
}

function closeTargetModal() {
  if (savingTarget.value) return;
  targetModalOpen.value = false;
}

function fillTargetKeyFromName() {
  if (targetForm.targetKey.trim()) return;
  const raw = targetForm.displayName.trim().toLowerCase();
  const next = raw
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  targetForm.targetKey = next;
}

async function saveTarget() {
  if (!canSaveTarget.value || !datasetId.value) return;

  savingTarget.value = true;
  targetsError.value = "";

  const payload: CreateTargetPayload = {
    targetKey: targetForm.targetKey.trim(),
    displayName: targetForm.displayName.trim(),
    factTable: targetForm.factTable.trim(),
    factColumn: targetForm.factColumn.trim(),
    valueType: targetForm.valueType,
    defaultBehavior: targetForm.defaultBehavior,
    status: targetForm.status,
  };

    try {
      if (!targetEditing.value) {
        const created = await createRlsTarget(datasetId.value, payload);
        targets.value = [...targets.value, created];
        push({ kind: "success", title: "Target criado", message: `${created.targetKey}` });
        targetModalOpen.value = false;
        return;
      }

      const updated = await updateRlsTarget(targetEditing.value.id, payload);
      targets.value = targets.value.map((t) => (t.id === updated.id ? updated : t));
      push({ kind: "success", title: "Target atualizado", message: `${updated.targetKey}` });
      targetModalOpen.value = false;
    } catch (e: any) {
      const ne = normalizeApiError(e);
      targetsError.value = ne.message;
    push({
      kind: "error",
      title: "Falha ao salvar target",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    savingTarget.value = false;
  }
}

async function removeTarget(t: RlsTarget) {
  const ok = await confirm({
    title: "Excluir target?",
    message: `Voce esta prestes a excluir o target ${t.targetKey}. Esta acao e destrutiva.`,
    confirmText: "Excluir",
    cancelText: "Cancelar",
    danger: true,
  });
  if (!ok) return;

  await targetBusy.run(t.id, async () => {
    try {
      await deleteRlsTarget(t.id);
      targets.value = targets.value.filter((x) => x.id !== t.id);
      if (selectedTargetId.value === t.id) {
        selectedTargetId.value = targets.value[0]?.id ?? "";
      }
      push({ kind: "success", title: "Target removido", message: t.targetKey });
    } catch (e: any) {
      const ne = normalizeApiError(e);
      push({
        kind: "error",
        title: "Falha ao remover target",
        message: ne.message,
        details: ne.details,
        timeoutMs: 9000,
      });
    }
  });
}

// =====================
// Rules
// =====================
const selectedTargetId = ref<string>("");
const rules = ref<RlsRule[]>([]);
const loadingRules = ref(false);
const rulesError = ref("");
const ruleBusy = useBusyMap();

const rulesFilterScope = ref<"all" | "customer" | "user">("all");
const rulesFilterCustomerId = ref<string>("");
const rulesFilterUserId = ref<string>("");

const ruleModalSaving = ref(false);
const ruleModalError = ref("");
const ruleForm = reactive<{
  targetId: string;
  scope: "customer" | "user";
  customerId: string;
  userId: string;
  op: RlsRuleOp;
  values: string;
}>({
  targetId: "",
  scope: "customer",
  customerId: "",
  userId: "",
  op: "include",
  values: "",
});

const refreshInFlight = ref(false);
const refreshQueued = ref(false);

const selectedTarget = computed(() => targets.value.find((t) => t.id === selectedTargetId.value) ?? null);
const ruleFormTarget = computed(() => targets.value.find((t) => t.id === ruleForm.targetId) ?? null);

const canSaveRule = computed(() => {
  return (
    !!datasetId.value &&
    !!ruleForm.targetId &&
    ((ruleForm.scope === "customer" && !!ruleForm.customerId) ||
      (ruleForm.scope === "user" && !!ruleForm.userId)) &&
    ruleForm.values.trim().length > 0
  );
});

const ruleValuesPlaceholder = computed(() => {
  const vt = ruleFormTarget.value?.valueType;
  if (vt === "int") return "ex: 10, 11";
  if (vt === "uuid") return "ex: 123e4567-e89b-12d3-a456-426614174000";
  return "ex: ACME, C6";
});

function splitValues(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function triggerDatasetRefresh(reason: string) {
  if (!datasetId.value) return;
  if (refreshInFlight.value) {
    refreshQueued.value = true;
    return;
  }
  refreshInFlight.value = true;

  try {
    const res = await refreshRlsDataset(datasetId.value);
    const detail = res.pending
      ? "Refresh em andamento, pendente agendado."
      : res.status === "scheduled"
        ? "Refresh agendado."
        : "Refresh solicitado.";
    push({
      kind: "success",
      title: `Refresh RLS (${reason})`,
      message: detail,
    });
  } catch (e: any) {
    const ne = normalizeApiError(e);
    push({
      kind: "error",
      title: "Falha ao solicitar refresh",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    refreshInFlight.value = false;
    if (refreshQueued.value) {
      refreshQueued.value = false;
      void triggerDatasetRefresh("alteracao adicional");
    }
  }
}

async function loadRules() {
  if (!selectedTargetId.value) {
    rules.value = [];
    return;
  }

  loadingRules.value = true;
  rulesError.value = "";

  try {
    const opts =
      rulesFilterScope.value === "customer"
        ? { customerId: rulesFilterCustomerId.value || undefined }
        : rulesFilterScope.value === "user"
          ? { userId: rulesFilterUserId.value || undefined }
          : undefined;
    const res = await listRlsRules(selectedTargetId.value, opts);
    rules.value = res.items;
  } catch (e: any) {
    const ne = normalizeApiError(e);
    rulesError.value = ne.message;
    push({
      kind: "error",
      title: "Falha ao carregar regras",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    loadingRules.value = false;
  }
}

function openRuleCreate() {
  ruleModalError.value = "";
  ruleForm.targetId = selectedTargetId.value || targets.value[0]?.id || "";
  ruleForm.scope = "customer";
  ruleForm.customerId = "";
  ruleForm.userId = "";
  ruleForm.op = "include";
  ruleForm.values = "";
  ruleModalOpen.value = true;
}

function closeRuleModal() {
  if (ruleModalSaving.value) return;
  ruleModalOpen.value = false;
}

async function saveRuleModal() {
  if (!ruleFormTarget.value || !canSaveRule.value) return;

  ruleModalError.value = "";
  ruleModalSaving.value = true;

  try {
    const values = splitValues(ruleForm.values);
    if (!values.length) {
      ruleModalError.value = "Informe ao menos um valor.";
      return;
    }

    const items: CreateRulePayload[] = [];
    const ruleScope = ruleForm.scope;
    const ownerId = ruleScope === "customer" ? ruleForm.customerId : ruleForm.userId;

    for (const value of values) {
      if (ruleFormTarget.value.valueType === "text") {
        items.push({
          ...(ruleScope === "customer" ? { customerId: ownerId } : { userId: ownerId }),
          op: ruleForm.op,
          valueText: value,
        });
      } else if (ruleFormTarget.value.valueType === "int") {
        const n = Number(value);
        if (!Number.isFinite(n) || !Number.isInteger(n)) {
          ruleModalError.value = `Valor invalido para int: ${value}`;
          return;
        }
        items.push({
          ...(ruleScope === "customer" ? { customerId: ownerId } : { userId: ownerId }),
          op: ruleForm.op,
          valueInt: n,
        });
      } else {
        if (!UUID_RE.test(value)) {
          ruleModalError.value = `Valor invalido para uuid: ${value}`;
          return;
        }
        items.push({
          ...(ruleScope === "customer" ? { customerId: ownerId } : { userId: ownerId }),
          op: ruleForm.op,
          valueUuid: value,
        });
      }
    }

    await createRlsRules(ruleFormTarget.value.id, items);
    push({ kind: "success", title: "Regras criadas", message: `${items.length} regra(s)` });
    ruleForm.values = "";
    ruleModalOpen.value = false;

    if (selectedTargetId.value !== ruleForm.targetId) {
      selectedTargetId.value = ruleForm.targetId;
    } else {
      await loadRules();
    }

    void triggerDatasetRefresh("regras criadas");
  } catch (e: any) {
    const ne = normalizeApiError(e);
    ruleModalError.value = ne.message;
    push({
      kind: "error",
      title: "Falha ao criar regras",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    ruleModalSaving.value = false;
  }
}

async function removeRule(r: RlsRule) {
  const ok = await confirm({
    title: "Excluir regra?",
    message: "Voce esta prestes a excluir esta regra. Esta acao e destrutiva.",
    confirmText: "Excluir",
    cancelText: "Cancelar",
    danger: true,
  });
  if (!ok) return;

  await ruleBusy.run(r.id, async () => {
    try {
      await deleteRlsRule(r.id);
      rules.value = rules.value.filter((x) => x.id !== r.id);
      push({ kind: "success", title: "Regra removida" });
      void triggerDatasetRefresh("regra removida");
    } catch (e: any) {
      const ne = normalizeApiError(e);
      push({
        kind: "error",
        title: "Falha ao remover regra",
        message: ne.message,
        details: ne.details,
        timeoutMs: 9000,
      });
    }
  });
}

function formatRuleValue(r: RlsRule) {
  if (r.valueText !== null && r.valueText !== undefined) return r.valueText;
  if (r.valueInt !== null && r.valueInt !== undefined) return String(r.valueInt);
  if (r.valueUuid !== null && r.valueUuid !== undefined) return r.valueUuid;
  return "";
}

function customerLabel(id?: string | null) {
  if (!id) return "Sem customer";
  const c = customers.value.find((x) => x.id === id);
  if (!c) return id;
  return `${c.code} - ${c.name}`;
}

function userLabel(id?: string | null) {
  if (!id) return "Sem usuario";
  const u = activeUsers.value.find((x) => x.id === id);
  if (!u) return id;
  return u.display_name || u.email || u.id;
}

function ruleOwnerLabel(r: RlsRule) {
  return r.customerId ? customerLabel(r.customerId) : userLabel(r.userId);
}

function ruleOwnerId(r: RlsRule) {
  return r.customerId ?? r.userId ?? "-";
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

// =====================
// Snapshot
// =====================
const snapshot = ref<RlsSnapshot | null>(null);
const snapshotLoading = ref(false);
const snapshotError = ref("");
const snapshotExporting = ref<"" | "json" | "csv">("");

const snapshotCounts = computed(() => ({
  targets: snapshot.value?.targets.length ?? 0,
  rules: snapshot.value?.rules.length ?? 0,
}));

async function loadSnapshot() {
  if (!datasetId.value) return;
  snapshotLoading.value = true;
  snapshotError.value = "";

  try {
    snapshot.value = await getRlsSnapshot(datasetId.value);
  } catch (e: any) {
    const ne = normalizeApiError(e);
    snapshotError.value = ne.message;
    push({
      kind: "error",
      title: "Falha ao gerar snapshot",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    snapshotLoading.value = false;
  }
}

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportSnapshot(format: "json" | "csv") {
  if (!datasetId.value || snapshotExporting.value) return;
  snapshotExporting.value = format;

  try {
    if (format === "json") {
      const data = snapshot.value ?? (await getRlsSnapshot(datasetId.value));
      snapshot.value = data;
      const content = JSON.stringify(data, null, 2);
      downloadText(`rls_snapshot_${datasetId.value}.json`, content, "application/json");
      return;
    }

    const csv = await getRlsSnapshotCsv(datasetId.value);
    downloadText(csv.filename, csv.content, csv.contentType || "text/csv");
  } catch (e: any) {
    const ne = normalizeApiError(e);
    push({
      kind: "error",
      title: "Falha ao exportar snapshot",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    snapshotExporting.value = "";
  }
}

function buildGuideSteps(t: RlsTarget): GuideStep[] {
  return [
    {
      key: "connect",
      title: `Conectar Sec_${t.targetKey} (Postgres)`,
      subtitle: "Import direto da view pronta",
      bullets: [
        "Abra o Power BI Desktop.",
        "Home -> Get Data -> PostgreSQL database.",
        "Preencha Server e Database e clique OK.",
        "Autentique com usuario/senha (tipo Database).",
        `No Navigator, abra o schema (ex: public) e selecione Sec_${t.targetKey}.`,
        "Clique Transform Data para abrir o Power Query.",
        "Confirme tipos: customer_id/user_id como Text e value_* conforme value_type.",
      ],
      tips: [
        `A API cria a view Sec_${t.targetKey} automaticamente ao salvar o target.`,
      ],
      screenshotHint: `Navigator mostrando Sec_${t.targetKey}.`,
    },
    {
      key: "dim",
      title: `Criar Dim_${t.targetKey}`,
      subtitle: "Dimensao com valores distintos",
      bullets: [
        `Na tabela de fato ${t.factTable}, clique com o botao direito -> Reference.`,
        `Renomeie para Dim_${t.targetKey}.`,
        `Mantenha apenas a coluna ${t.factColumn}.`,
        "Normalize valores (Trim + Clean). Uppercase somente se aplicar no Sec_.",
        "Remova valores em branco (filtro: is not blank).",
        "Remove Duplicates para garantir 1:*.",
        "Renomeie a coluna para Value.",
      ],
      tips: [
        "Sem duplicados a relacao 1:* fica mais estavel.",
      ],
      screenshotHint: "Dim criada com coluna Value e duplicados removidos.",
    },
    {
      key: "apply",
      title: "Close & Apply",
      subtitle: "Carregar no modelo",
      bullets: [
        "Clique Close & Apply.",
        "Aguarde carregar Sec_*, Dim_* e a tabela de fato.",
      ],
      tips: [
        "Se o load demorar muito, revise as colunas mantidas nas queries.",
      ],
      screenshotHint: "Botao Close & Apply no Power Query.",
    },
    {
      key: "rel",
      title: "Relacionamento no Model view",
      subtitle: "Dim -> Fact",
      bullets: [
        `Arraste Dim_${t.targetKey}[Value] para ${t.factTable}[${t.factColumn}].`,
        "Cardinality: One to many (1:*).",
        "Cross filter direction: Single.",
        "Make relationship active: Yes.",
      ],
      tips: [
        "Se aparecer many-to-many, volte na Dim e remova duplicados/valores vazios.",
        "Nao crie relacionamento entre Sec_ e Dim_.",
      ],
      screenshotHint: "Tela de relacionamento com 1:* e Single.",
    },
    {
      key: "role",
      title: "Role CustomerRLS + DAX",
      subtitle: "Modeling -> Manage roles",
      bullets: [
        "Modeling -> Manage roles -> New.",
        "Nome da role: CustomerRLS.",
        `Selecione a tabela Dim_${t.targetKey}.`,
        `Default behavior do target: ${t.defaultBehavior}.`,
        "Cole o DAX no filtro da tabela.",
      ],
      tips: [
        "CUSTOMDATA() vem do embed token; USERNAME() vem da effective identity.",
        "Garanta customer_id e user_id como Text.",
        "Se default for deny, sem include a visibilidade sera negada.",
      ],
      links: [
        { label: "RLS no Power BI", href: "https://learn.microsoft.com/power-bi/enterprise/service-admin-rls" },
        { label: "Embed + RLS", href: "https://learn.microsoft.com/power-bi/developer/embedded/embed-sample-for-customers#row-level-security-rls" },
      ],
      showDax: true,
      screenshotHint: "Tela Manage roles com filtro DAX aplicado.",
    },
    {
      key: "validate",
      title: "Validacao rapida",
      subtitle: "Slicer + View as Roles",
      bullets: [
        `Crie um slicer com Dim_${t.targetKey}[Value].`,
        `Crie uma tabela com colunas da fato ${t.factTable}.`,
        "View -> View as -> selecione CustomerRLS.",
        "Teste se os dados filtram como esperado.",
      ],
      tips: [
        "No Service, RLS so restringe usuarios Viewer.",
      ],
      screenshotHint: "Slicer + tabela filtrada ao usar View as Roles.",
    },
  ];
}

function valueColumnForTarget(t: RlsTarget) {
  if (t.valueType === "int") return "value_int";
  if (t.valueType === "uuid") return "value_uuid";
  return "value_text";
}

function daxForTarget(t: RlsTarget) {
  const sec = `Sec_${t.targetKey}`;
  const dim = `Dim_${t.targetKey}`;
  const valueCol = valueColumnForTarget(t);
  const defaultAllow = t.defaultBehavior === "deny" ? "FALSE()" : "TRUE()";
  return [
    "VAR user = USERNAME()",
    "VAR customer = CUSTOMDATA()",
    `VAR userInc =`,
    `    CALCULATETABLE(VALUES(${sec}[${valueCol}]), ${sec}[user_id] = user, ${sec}[op] = "include")`,
    "VAR userExc =",
    `    CALCULATETABLE(VALUES(${sec}[${valueCol}]), ${sec}[user_id] = user, ${sec}[op] = "exclude")`,
    "VAR hasUser = COUNTROWS(userInc) + COUNTROWS(userExc) > 0",
    `VAR inc =`,
    `    CALCULATETABLE(VALUES(${sec}[${valueCol}]), ${sec}[customer_id] = customer, ${sec}[op] = "include")`,
    "VAR exc =",
    `    CALCULATETABLE(VALUES(${sec}[${valueCol}]), ${sec}[customer_id] = customer, ${sec}[op] = "exclude")`,
    "VAR hasInc = COUNTROWS(inc) > 0",
    `VAR defaultAllow = ${defaultAllow}`,
    `VAR isInc = IF(hasUser, ${dim}[Value] IN userInc, IF(hasInc, ${dim}[Value] IN inc, defaultAllow))`,
    `VAR isExc = IF(hasUser, ${dim}[Value] IN userExc, ${dim}[Value] IN exc)`,
    "RETURN isInc && NOT isExc",
  ].join("\n");
}

// =====================
// Watchers
// =====================
watch(datasetId, async (next) => {
  targets.value = [];
  rules.value = [];
  selectedTargetId.value = "";
  rulesFilterScope.value = "all";
  rulesFilterCustomerId.value = "";
  rulesFilterUserId.value = "";
  ruleForm.targetId = "";
  ruleForm.scope = "customer";
  ruleForm.customerId = "";
  ruleForm.userId = "";
  ruleForm.op = "include";
  ruleForm.values = "";
  ruleModalError.value = "";
  snapshot.value = null;
  snapshotError.value = "";

  if (next) {
    await loadTargets();
    if (activeTab.value === "snapshot") {
      await loadSnapshot();
    }
  }
});

watch(activeTab, async (next) => {
  if (next === "snapshot") {
    if (!datasetId.value || snapshot.value || snapshotLoading.value) return;
    await loadSnapshot();
  }
  if (next === "rules") {
    if (!activeUsers.value.length && !loadingUsers.value) {
      await loadActiveUsers();
    }
  }
});

watch(targets, () => {
  if (selectedTargetId.value && targets.value.some((t) => t.id === selectedTargetId.value)) return;
  selectedTargetId.value = targets.value[0]?.id ?? "";
});

watch(selectedTargetId, async (next) => {
  rules.value = [];
  if (!next) return;
  await loadRules();
});

watch(rulesFilterScope, async () => {
  if (!selectedTargetId.value) return;
  await loadRules();
});

watch(rulesFilterCustomerId, async () => {
  if (!selectedTargetId.value) return;
  await loadRules();
});

watch(rulesFilterUserId, async () => {
  if (!selectedTargetId.value) return;
  await loadRules();
});

watch(
  () => ruleForm.scope,
  (next) => {
    if (next === "customer") {
      ruleForm.userId = "";
    } else {
      ruleForm.customerId = "";
    }
  },
);

async function refresh() {
  await loadDatasets();
  if (datasetId.value) await loadTargets();
  if (selectedTargetId.value) await loadRules();
}

defineExpose({ refresh });

onMounted(async () => {
  await loadDatasets();
  await loadActiveUsers();
});
</script>
