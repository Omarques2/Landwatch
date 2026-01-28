<!-- apps/web/src/admin/CustomersPanel.vue -->
<template>
  <PanelCard>
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <div class="text-sm font-semibold text-foreground">Customers</div>
        <div class="mt-1 text-xs text-muted-foreground">
          Gerencie customers e suas permissoes de Power BI em um unico fluxo.
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <UiButton
          type="button"
          variant="outline"
          size="sm"
          class="h-9 px-3 text-xs"
          :disabled="!!loading"
          @click="refreshSafe"
        >
          {{ loading ? "Carregando..." : "Recarregar" }}
        </UiButton>

        <UiButton
          type="button"
          variant="default"
          size="sm"
          class="h-9 px-3 text-xs"
          @click="openCreate"
        >
          + Novo customer
        </UiButton>
      </div>
    </div>

    <div v-if="errorText" class="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
      {{ errorText }}
    </div>

    <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <UiInput
        v-model="q"
        class="w-full"
        placeholder="Buscar por code/nome"
      />
      <div class="shrink-0 text-xs text-muted-foreground">
        {{ filtered.length }} / {{ customers.length }}
      </div>
    </div>

    <CustomerTable
      :rows="filtered"
      :is-busy="busy.isBusy"
      @edit="openEdit"
      @toggle-status="toggleStatus"
    />

    <!-- MODAL: customer hub -->
    <div v-if="modalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        class="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-start justify-between gap-3 border-b border-border p-4">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-foreground">
              {{ modalCustomer ? `Customer • ${modalCustomer.code}` : "Novo customer" }}
            </div>
            <div class="mt-1 text-xs text-muted-foreground">
              {{ modalCustomer ? "Central de configuracoes do customer." : "Crie um customer para liberar as configuracoes." }}
            </div>
          </div>

          <UiButton
            type="button"
            variant="outline"
            size="sm"
            class="h-8 px-3 text-xs"
            :disabled="modalSaving"
            @click="closeModal"
          >
            Fechar
          </UiButton>
        </div>

        <div class="max-h-[82vh] overflow-hidden p-4">
          <div v-if="!modalCustomer" class="rounded-2xl border border-border p-4">
            <div class="text-sm font-semibold text-foreground">Informacoes basicas</div>
            <div class="mt-1 text-xs text-muted-foreground">
              Salve o customer para liberar as abas de configuracao.
            </div>

            <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label class="text-xs font-medium text-muted-foreground">Code</label>
                <UiInput
                  v-model="form.code"
                  class="mt-1 w-full"
                  :disabled="modalSaving"
                  placeholder="ex: ACME"
                />
              </div>

              <div>
                <label class="text-xs font-medium text-muted-foreground">Nome</label>
                <UiInput
                  v-model="form.name"
                  class="mt-1 w-full"
                  :disabled="modalSaving"
                  placeholder="ex: ACME Ltda"
                />
              </div>
            </div>

            <div class="mt-4 flex items-center justify-end gap-2">
              <UiButton
                type="button"
                variant="outline"
                size="md"
                class="h-9 px-4 text-sm"
                :disabled="modalSaving"
                @click="closeModal"
              >
                Cancelar
              </UiButton>

              <UiButton
                type="button"
                variant="default"
                size="md"
                class="h-9 px-4 text-sm"
                :disabled="modalSaving || !canSubmit"
                @click="saveCustomer"
              >
                {{ modalSaving ? "Salvando..." : "Salvar" }}
              </UiButton>
            </div>
          </div>

          <div v-else class="flex h-full flex-col">
            <div class="sticky top-0 z-10 border-b border-border bg-card pb-2">
              <UiTabs v-model="modalTab" :tabs="modalTabs" />
            </div>

            <div class="mt-4 min-h-0 flex-1 overflow-y-auto">
              <!-- TAB: SUMMARY -->
              <div v-if="modalTab === 'summary'" class="space-y-4">
              <div class="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
                <div class="rounded-2xl border border-border p-4">
                  <div class="text-sm font-semibold text-foreground">Dados basicos</div>
                  <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label class="text-xs font-medium text-muted-foreground">Code</label>
                      <UiInput
                        v-model="form.code"
                        class="mt-1 w-full"
                        :disabled="modalSaving"
                      />
                    </div>

                    <div>
                      <label class="text-xs font-medium text-muted-foreground">Nome</label>
                      <UiInput
                        v-model="form.name"
                        class="mt-1 w-full"
                        :disabled="modalSaving"
                      />
                    </div>
                  </div>

                  <div class="mt-4 flex flex-wrap items-center gap-2">
                    <UiButton
                      type="button"
                      variant="default"
                      size="sm"
                      class="h-9 px-4 text-xs"
                      :disabled="modalSaving || !canSubmit"
                      @click="saveCustomer"
                    >
                      {{ modalSaving ? "Salvando..." : "Salvar alteracoes" }}
                    </UiButton>

                    <UiButton
                      type="button"
                      variant="outline"
                      size="sm"
                      class="h-9 px-4 text-xs"
                      :class="modalCustomer.status === 'active'
                        ? 'border-rose-200 bg-rose-600 text-white hover:bg-rose-500 dark:border-rose-900/40 dark:bg-rose-700 dark:hover:bg-rose-600'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'"
                      :disabled="busy.isBusy(modalCustomer.id)"
                      @click="toggleStatus(modalCustomer)"
                    >
                      {{ modalCustomer.status === 'active' ? "Desativar" : "Ativar" }}
                    </UiButton>
                  </div>
                </div>

                <div class="rounded-2xl border border-border p-4">
                  <div class="text-sm font-semibold text-foreground">Resumo rapido</div>
                  <div v-if="summaryLoading" class="mt-3 space-y-2 animate-pulse">
                    <div class="h-3 rounded bg-slate-200 dark:bg-slate-800"></div>
                    <div class="h-3 rounded bg-slate-200 dark:bg-slate-800"></div>
                    <div class="h-3 rounded bg-slate-200 dark:bg-slate-800"></div>
                    <div class="h-3 rounded bg-slate-200 dark:bg-slate-800"></div>
                    <div class="h-3 rounded bg-slate-200 dark:bg-slate-800"></div>
                    <div class="h-3 rounded bg-slate-200 dark:bg-slate-800"></div>
                    <div class="h-3 rounded bg-slate-200 dark:bg-slate-800"></div>
                  </div>
                  <div v-else-if="summary" class="mt-3 space-y-2 text-xs text-slate-700 dark:text-slate-200">
                    <div class="flex items-center justify-between">
                      <span>Usuarios</span>
                      <span class="font-semibold">{{ summary.users.total }}</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span>Ativos</span>
                      <span class="font-semibold">{{ summary.users.active }}</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span>Pendentes</span>
                      <span class="font-semibold">{{ summary.users.pending }}</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span>Desativados</span>
                      <span class="font-semibold">{{ summary.users.disabled }}</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span>Workspaces ativos</span>
                      <span class="font-semibold">{{ summary.workspacesActive }}</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span>Reports ativos</span>
                      <span class="font-semibold">{{ summary.reportsActive }}</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span>Grupos de paginas ativos</span>
                      <span class="font-semibold">{{ summary.pageGroupsActive }}</span>
                    </div>
                  </div>
                  <div v-else class="mt-3 text-xs text-slate-500 dark:text-slate-400">Sem dados.</div>
                </div>
              </div>
            </div>

            <!-- TAB: REPORTS -->
            <div v-else-if="modalTab === 'reports'" class="space-y-4">
              <div class="rounded-2xl border border-border p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-foreground">Workspaces e relatorios</div>
                    <div class="mt-1 text-xs text-muted-foreground">
                      Ative ou desative workspaces e reports. O toggle aplica imediatamente.
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <UiButton
                      type="button"
                      variant="outline"
                      size="sm"
                      class="h-9 px-3 text-xs"
                      :disabled="syncing"
                      @click="runSync"
                    >
                      <span class="inline-flex items-center gap-2">
                        <span
                          v-if="syncing"
                          class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground"
                        ></span>
                        <span>{{ syncing ? "Sincronizando..." : "Sincronizar catalogo" }}</span>
                      </span>
                    </UiButton>
                  </div>
                </div>

                <div
                  v-if="catalogError"
                  class="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700
                         dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
                >
                  {{ catalogError }}
                </div>

                <div v-if="showCatalogSkeleton" class="mt-3 space-y-3 animate-pulse">
                  <div class="h-16 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
                  <div class="h-16 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
                  <div class="h-16 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
                </div>

                <div v-else class="mt-3 max-h-[60vh] space-y-3 overflow-y-auto pr-1 pb-2">
                  <details
                    v-for="w in catalogWorkspaces"
                    :key="w.workspaceRefId"
                    class="group rounded-xl border border-slate-200 dark:border-slate-800"
                  >
                    <summary
                      class="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2
                             hover:bg-slate-50 dark:hover:bg-slate-800/40 [&::-webkit-details-marker]:hidden"
                    >
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {{ w.name }}
                          </div>
                          <span
                            v-if="!w.isActive"
                            class="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700
                                   dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200"
                          >
                            inativo
                          </span>
                        </div>
                        <div class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {{ w.reports.length }} reports
                        </div>
                      </div>

                      <div class="flex items-center gap-2">
                        <PermSwitch
                          :model-value="w.isActive"
                          :loading="busyWorkspacePerm.isBusy(w.workspaceRefId)"
                          on-label="ON"
                          off-label="OFF"
                          @toggle="toggleWorkspaceAccess(w)"
                        />
                        <span
                          class="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700
                                dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                          aria-hidden="true"
                        >
                          <svg
                            class="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </span>
                      </div>
                    </summary>

                    <div class="px-3 pb-3 pt-1">
                      <div class="space-y-2">
                        <div
                          v-for="r in w.reports"
                          :key="r.reportRefId"
                          class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2
                                 dark:border-slate-800 dark:bg-slate-950"
                        >
                          <div class="min-w-0">
                            <div class="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {{ r.name }}
                              <span v-if="!r.isActive" class="ml-1 text-rose-600 dark:text-rose-300">(inativo)</span>
                              <span v-else-if="!r.canView" class="ml-1 text-amber-600 dark:text-amber-300">(sem acesso)</span>
                            </div>
                            <div class="truncate text-[11px] text-slate-500 dark:text-slate-400">{{ r.reportId }}</div>
                          </div>

                          <PermSwitch
                            :model-value="r.canView"
                            :loading="busyReportPerm.isBusy(r.reportRefId)"
                            :disabled="!r.isActive"
                            on-label="ON"
                            off-label="OFF"
                            @toggle="toggleReportAccess(w.workspaceRefId, r.reportRefId)"
                          />
                        </div>
                      </div>
                    </div>
                  </details>

                  <div v-if="!catalogWorkspaces.length && !showCatalogSkeleton" class="text-xs text-slate-500 dark:text-slate-400">
                    Nenhum workspace encontrado no catalogo.
                  </div>
                </div>
              </div>
            </div>

            <!-- TAB: PAGES -->
            <div
              v-else-if="modalTab === 'pages'"
              class="min-h-0 max-h-[70vh] space-y-4 overflow-y-auto pr-1 pb-2 lg:max-h-none lg:overflow-visible lg:pr-0 lg:pb-0"
            >
              <div class="rounded-2xl border border-border p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-foreground">Permissoes de paginas</div>
                    <div class="mt-1 text-xs text-muted-foreground">
                      Defina paginas individuais ou grupos reutilizaveis por report.
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <UiButton
                      type="button"
                      variant="outline"
                      size="sm"
                      class="h-9 px-3 text-xs"
                      :disabled="!pageReportRefId || syncingPages"
                      @click="syncPages"
                    >
                      <span class="inline-flex items-center gap-2">
                        <span
                          v-if="syncingPages"
                          class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground"
                        ></span>
                        <span>{{ syncingPages ? "Sincronizando..." : "Sync paginas" }}</span>
                      </span>
                    </UiButton>
                    <UiButton
                      type="button"
                      variant="default"
                      size="sm"
                      class="h-9 px-3 text-xs"
                      :disabled="!pageReportRefId || !hasPreviewSelection"
                      @click="openPreview"
                    >
                      Preview
                    </UiButton>
                  </div>
                </div>

                <div class="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[1.25fr_1fr]">
                  <div class="rounded-2xl border border-border p-3 lg:col-span-2">
                    <label class="text-xs font-medium text-muted-foreground">Report</label>
                    <UiSelect v-model="pageReportRefId" class="mt-1 w-full">
                      <option value="">-- selecione --</option>
                      <option v-for="r in pageReportOptions" :key="r.reportRefId" :value="r.reportRefId">
                        {{ r.label }}
                      </option>
                    </UiSelect>
                    <div class="mt-1 text-[11px] text-muted-foreground">
                      O sync atualiza a lista de paginas do report.
                    </div>
                  </div>

                  <div
                    v-if="pageError"
                    class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700
                           dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200 lg:col-span-2"
                  >
                    {{ pageError }}
                  </div>

                  <div class="space-y-3 lg:col-start-2 lg:row-start-2">
                    <div class="rounded-2xl border border-border p-3">
                      <div class="flex items-center justify-between">
                        <div class="text-xs font-semibold text-foreground">Grupos</div>
                        <UiButton
                          type="button"
                          variant="outline"
                          size="sm"
                          class="h-7 px-2 text-[11px]"
                          :disabled="!pageReportRefId"
                          @click="openGroupModal()"
                        >
                          Novo grupo
                        </UiButton>
                      </div>
                      <div class="mt-2 text-[11px] text-muted-foreground">
                        Ao ativar um grupo, as paginas individuais ficam somente leitura.
                      </div>

                      <div class="mt-3 max-h-none space-y-2 overflow-visible pr-1 pb-2 lg:max-h-[45vh] lg:overflow-y-auto">
                        <div v-if="pagesLoading && !pageGroupsWithAccess.length" class="space-y-2 animate-pulse">
                          <div class="h-14 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
                          <div class="h-14 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
                        </div>
                        <div
                          v-for="g in pageGroupsWithAccess"
                          :key="g.id"
                          class="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2
                                 dark:border-slate-800 dark:bg-slate-950"
                          :class="selectedGroupIds.has(g.id)
                            ? '!border-emerald-400 !bg-emerald-100/70 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.35)] dark:!border-emerald-400/70 dark:!bg-emerald-500/10'
                            : ''"
                          @click="toggleGroupSelection(g.id)"
                        >
                          <div class="min-w-0">
                            <div class="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {{ g.name }}
                            </div>
                            <div class="text-[11px] text-slate-500 dark:text-slate-400">
                              {{ g.pageIds.length }} paginas
                            </div>
                          </div>

                          <div class="flex items-center gap-2">
                            <UiButton
                              type="button"
                              variant="outline"
                              size="sm"
                              class="h-7 px-2 text-[11px]"
                              :disabled="busyGroupAssign.isBusy(g.id)"
                              @click.stop="openGroupModal(g)"
                            >
                              Editar
                            </UiButton>

                            <PermSwitch
                              :model-value="!!g.assigned"
                              :loading="busyGroupAssign.isBusy(g.id)"
                              on-label="ON"
                              off-label="OFF"
                              @toggle="toggleGroupAssign(g)"
                              @click.stop
                            />
                          </div>
                        </div>

                        <div v-if="!pageGroupsWithAccess.length && !pagesLoading" class="text-xs text-slate-500 dark:text-slate-400">
                          Nenhum grupo criado.
                        </div>
                      </div>
                    </div>

                  </div>

                  <div class="space-y-3 lg:col-start-1 lg:row-start-2">
                    <div class="rounded-2xl border border-border p-3">
                        <div class="flex items-center justify-between gap-2">
                          <div class="text-xs font-semibold text-foreground">Paginas</div>
                          <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <UiButton
                              type="button"
                              variant="outline"
                              size="sm"
                              class="h-7 px-2 text-[11px]"
                              :disabled="pagesLoading || hasActiveGroupAssignments || !pageAccessPages.length"
                              @click="selectAllPages"
                            >
                              Selecionar todas
                            </UiButton>
                            <span>{{ pageAccessPages.length }} paginas</span>
                          </div>
                        </div>

                      <div
                        v-if="hasActiveGroupAssignments"
                        class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700
                               dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200"
                      >
                        Existem grupos ativos para este customer. As paginas individuais ficam somente leitura.
                      </div>

                      <div class="mt-3 max-h-none space-y-2 overflow-visible pr-1 pb-2 lg:max-h-[45vh] lg:overflow-y-auto">
                        <div v-if="pagesLoading && !pageAccessPages.length" class="space-y-2 animate-pulse">
                          <div class="h-14 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
                          <div class="h-14 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
                          <div class="h-14 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"></div>
                        </div>
                        <div
                          v-for="p in pageAccessPages"
                          :key="p.id"
                          class="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2
                                 dark:border-slate-800 dark:bg-slate-950"
                          :class="selectedPageIds.has(p.id)
                            ? '!border-emerald-400 !bg-emerald-100/70 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.35)] dark:!border-emerald-400/70 dark:!bg-emerald-500/10'
                            : ''"
                          @click="togglePageSelection(p.id)"
                        >
                          <div class="min-w-0">
                            <div class="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {{ p.displayName || p.pageName }}
                            </div>
                            <div class="truncate text-[11px] text-slate-500 dark:text-slate-400">{{ p.pageName }}</div>
                          </div>

                          <div class="flex items-center gap-2" @click.stop>
                            <PermSwitch
                              :model-value="!!p.canView"
                              :loading="busyPageAllow.isBusy(p.id)"
                              :disabled="hasActiveGroupAssignments"
                              on-label="ON"
                              off-label="OFF"
                              @toggle="togglePageAllow(p)"
                            />
                          </div>
                        </div>

                        <div v-if="!pageAccessPages.length && !pagesLoading" class="text-xs text-slate-500 dark:text-slate-400">
                          Nenhuma pagina sincronizada.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- TAB: PREVIEW -->
            <div v-else-if="modalTab === 'preview'" class="space-y-4">
              <div class="rounded-2xl border border-border p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-foreground">Preview do customer</div>
                    <div class="mt-1 text-xs text-muted-foreground">
                      Simulacao da experiencia do customer com paginas permitidas.
                    </div>
                  </div>
                </div>

                <div class="mt-3">
                  <label class="text-xs font-medium text-muted-foreground">Report</label>
                  <UiSelect v-model="previewReportRefId" class="mt-1 w-full">
                    <option value="">-- selecione --</option>
                    <option v-for="r in pageReportOptions" :key="r.reportRefId" :value="r.reportRefId">
                      {{ r.label }}
                    </option>
                  </UiSelect>
                  <div class="mt-1 text-[11px] text-muted-foreground">
                    O preview usa somente reports ativos para este customer.
                  </div>
                </div>

                <div
                  v-if="previewTabError"
                  class="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                >
                  {{ previewTabError }}
                </div>

                <div
                  v-if="previewTabPages.length"
                  class="relative z-10 mt-3 rounded-2xl border border-border bg-card/90 px-2 py-2 text-[11px] text-foreground"
                >
                  <div class="flex items-center gap-1 overflow-x-auto">
                    <button
                      v-for="p in previewTabPages"
                      :key="p.id"
                      type="button"
                      class="shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition
                             border border-transparent hover:bg-accent hover:text-accent-foreground"
                      :class="previewTabActivePageName === p.pageName
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent'"
                      @click="setPreviewTabPage(p.pageName)"
                    >
                        {{ p.displayName || p.pageName }}
                    </button>
                  </div>
                </div>
                
                <div class="mt-4">
                  <div class="relative z-0 flex w-full items-center justify-center rounded-2xl border border-border bg-card">
                    <div class="relative aspect-video w-full max-w-[1200px] max-h-[48vh] overflow-hidden rounded-xl bg-card md:max-h-[48vh]">
                      <div ref="previewTabContainerEl" class="absolute inset-0"></div>
                    </div>
                    <div
                      v-if="previewTabLoading"
                      class="absolute inset-0 grid place-items-center bg-background/70 text-xs text-muted-foreground backdrop-blur-sm"
                    >
                      <div class="w-[min(520px,90%)] text-center">
                        <div class="space-y-3">
                          <UiSkeleton class="h-6 w-full" />
                          <UiSkeleton class="h-4 w-5/6" />
                          <UiSkeleton class="h-4 w-2/3" />
                        </div>
                        <div class="mt-3 text-xs text-muted-foreground">
                          Carregando preview...
                        </div>
                      </div>
                    </div>
                    <div
                      v-if="!previewTabLoading && previewReportRefId && previewTabEmpty"
                      class="absolute inset-0 grid place-items-center"
                    >
                      <div class="w-[min(520px,90%)] text-center">
                        <div class="space-y-3">
                          <UiSkeleton class="h-6 w-full" />
                          <UiSkeleton class="h-4 w-5/6" />
                          <UiSkeleton class="h-4 w-2/3" />
                        </div>
                        <div class="mt-3 text-xs text-muted-foreground">
                          Nenhuma pagina permitida para este report.
                        </div>
                      </div>
                    </div>
                    <div
                      v-else-if="!previewTabLoading && !previewReportRefId"
                      class="absolute inset-0 grid place-items-center text-xs text-muted-foreground"
                    >
                      Selecione um report para visualizar.
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: group editor -->
    <div v-if="groupModalOpen" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
      <div class="w-full max-w-lg rounded-2xl border border-border bg-card p-4 shadow-xl">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-foreground">
              {{ groupModalMode === 'create' ? 'Novo grupo' : 'Editar grupo' }}
            </div>
            <div class="mt-1 text-xs text-muted-foreground">
              Selecione paginas para compor o grupo.
            </div>
          </div>
          <UiButton
            type="button"
            variant="outline"
            size="sm"
            class="h-8 px-3 text-xs"
            :disabled="pageModalSaving"
            @click="closeGroupModal"
          >
            Fechar
          </UiButton>
        </div>

        <div class="mt-4">
          <label class="text-xs font-medium text-muted-foreground">Nome</label>
          <UiInput
            v-model="groupModalName"
            class="mt-1 w-full"
            :disabled="pageModalSaving"
          />
        </div>

        <div class="mt-4">
          <div class="text-xs font-medium text-muted-foreground">Paginas</div>
          <div class="mt-2 max-h-[240px] space-y-2 overflow-y-auto">
            <label
              v-for="p in pageAccessPages"
              :key="p.id"
              class="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs"
            >
              <span class="truncate">{{ p.displayName || p.pageName }}</span>
              <input v-model="groupModalPageIds" type="checkbox" :value="p.id" />
            </label>
          </div>
        </div>

        <div v-if="groupModalError" class="mt-3 text-xs text-rose-600 dark:text-rose-300">{{ groupModalError }}</div>

        <div class="mt-4 flex items-center justify-end gap-2">
          <UiButton
            type="button"
            variant="outline"
            size="md"
            class="h-9 px-4 text-sm"
            :disabled="pageModalSaving"
            @click="closeGroupModal"
          >
            Cancelar
          </UiButton>
          <UiButton
            type="button"
            variant="default"
            size="md"
            class="h-9 px-4 text-sm"
            :disabled="pageModalSaving"
            @click="saveGroupModal"
          >
            {{ pageModalSaving ? "Salvando..." : "Salvar" }}
          </UiButton>
        </div>
      </div>
    </div>

    <!-- MODAL: preview -->
    <div v-if="previewOpen" class="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4">
      <div class="w-full max-w-5xl rounded-2xl border border-border bg-card p-4 shadow-xl">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-foreground">Preview do report</div>
            <div class="mt-1 text-xs text-muted-foreground">
              Simulacao das paginas permitidas para o customer.
            </div>
          </div>
          <UiButton
            type="button"
            variant="outline"
            size="sm"
            class="h-8 px-3 text-xs"
            @click="closePreview"
          >
            Fechar
          </UiButton>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="p in previewPages"
            :key="p.id"
            type="button"
            class="rounded-full border px-3 py-1 text-xs"
            :class="previewActivePage?.id === p.id
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-foreground'"
            @click="setPreviewPage(p)"
          >
            {{ p.displayName || p.pageName }}
          </button>
        </div>

        <div class="mt-4">
          <div v-if="previewError" class="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {{ previewError }}
          </div>
          <div class="relative h-[560px] rounded-2xl border border-border bg-card">
            <div ref="previewContainerEl" class="h-full w-full"></div>
            <div
              v-if="previewLoading"
              class="absolute inset-0 grid place-items-center bg-background/70 text-xs text-muted-foreground backdrop-blur-sm"
            >
              <div class="w-[min(520px,90%)] text-center">
                <div class="space-y-3">
                  <UiSkeleton class="h-6 w-full" />
                  <UiSkeleton class="h-4 w-5/6" />
                  <UiSkeleton class="h-4 w-2/3" />
                </div>
                <div class="mt-3 text-xs text-muted-foreground">
                  Carregando preview...
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PanelCard>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import * as pbi from "powerbi-client";

import type { CustomerRow, CustomerSummary } from "@/features/admin/api";
import {
  createCustomer,
  getCustomerSummary,
  setCustomerStatus,
  updateCustomer,
} from "@/features/admin/api";
import {
  createPageGroup,
  getAdminReportPreview,
  getCustomerPageAccess,
  getPowerBiCatalog,
  listPageGroups,
  listReportPages,
  setCustomerPageAllow,
  setCustomerPageGroup,
  setCustomerReportPermission,
  setCustomerWorkspacePermission,
  setPageGroupPages,
  syncPowerBiCatalog,
  syncReportPages,
  updatePageGroup,
  type CustomerCatalog,
  type PageGroup,
  type ReportPage,
} from "@/features/admin/api/powerbi";

import CustomerTable from "@/features/admin/customers/CustomerTable.vue";
import PanelCard from "@/ui/PanelCard.vue";
import { Button as UiButton, Input as UiInput, Select as UiSelect, Skeleton as UiSkeleton, Tabs as UiTabs } from "@/components/ui";
import { useConfirm } from "@/ui/confirm/useConfirm";
import { useBusyMap } from "@/ui/ops/useBusyMap";
import { useOptimisticMutation } from "@/ui/ops/useOptimisticMutation";
import { normalizeApiError } from "@/ui/ops/normalizeApiError";
import { useToast } from "@/ui/toast/useToast";
import { PermSwitch } from "@/ui/toggles";

const { confirm } = useConfirm();
const { push } = useToast();
const busy = useBusyMap();
const { mutate } = useOptimisticMutation();

const props = defineProps<{
  customers: CustomerRow[];
  loading?: boolean;
  error?: string;

  refresh: () => Promise<void> | void;
  upsertCustomerLocal: (row: CustomerRow) => void;
  patchCustomerLocal: (customerId: string, patch: Partial<CustomerRow>) => void;
}>();

// ---------- list / filter ----------
const q = ref("");

const errorText = computed(() => props.error ?? "");
const loading = computed(() => props.loading ?? false);
const customers = computed(() => props.customers ?? []);

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase();
  if (!needle) return customers.value;

  return customers.value.filter((c) => {
    const hay = `${c.code ?? ""} ${c.name ?? ""}`.toLowerCase();
    return hay.includes(needle);
  });
});

// ---------- modal state ----------
const modalOpen = ref(false);
const modalTab = ref<"summary" | "reports" | "pages" | "preview">("summary");
const modalCustomer = ref<CustomerRow | null>(null);
const modalSaving = ref(false);
const previewReportRefId = ref("");
const modalTabs = [
  { key: "summary", label: "Resumo" },
  { key: "reports", label: "Relatorios" },
  { key: "pages", label: "Paginas" },
  { key: "preview", label: "Preview" },
];

const form = reactive({
  code: "",
  name: "",
});

const canSubmit = computed(() => {
  const code = form.code.trim();
  const name = form.name.trim();
  return code.length >= 2 && name.length >= 2;
});

function openCreate() {
  modalCustomer.value = null;
  form.code = "";
  form.name = "";
  modalTab.value = "summary";
  previewReportRefId.value = "";
  resetPreviewTab();
  modalOpen.value = true;
  catalogLoaded.value = false;
  catalogSyncAttempted.value = false;
}

function openEdit(c: CustomerRow) {
  modalCustomer.value = c;
  form.code = c.code ?? "";
  form.name = c.name ?? "";
  modalTab.value = "summary";
  previewReportRefId.value = "";
  resetPreviewTab();
  modalOpen.value = true;
  void loadCustomerSummary();
  catalogLoaded.value = false;
  catalogSyncAttempted.value = false;
  void loadCatalog();
}

function closeModal() {
  if (modalSaving.value) return;
  modalOpen.value = false;
  resetPreviewTab();
  previewReportRefId.value = "";
  catalogLoaded.value = false;
  catalogSyncAttempted.value = false;
}

async function refreshSafe() {
  try {
    await props.refresh?.();
  } catch (e: any) {
    const ne = normalizeApiError(e);
    push({
      kind: "error",
      title: "Falha ao recarregar customers",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  }
}

async function toggleStatus(c: CustomerRow) {
  const next: "active" | "inactive" = c.status === "active" ? "inactive" : "active";

  if (next === "inactive") {
    const ok = await confirm({
      title: "Inativar customer?",
      message:
        "Inativar um customer pode desativar workspaces/reports e afetar acesso de usuarios. " +
        "Confirme que esta acao e realmente desejada.",
      confirmText: "Inativar",
      cancelText: "Cancelar",
      danger: true,
    });
    if (!ok) return;
  }

  await mutate<{ prevStatus: string }, { ok: boolean; status: string }>({
    key: c.id,
    busy,
    optimistic: () => {
      const prevStatus = c.status;
      props.patchCustomerLocal(c.id, { status: next });
      if (modalCustomer.value?.id === c.id) {
        modalCustomer.value = { ...modalCustomer.value, status: next };
      }
      return { prevStatus };
    },
    request: async () => {
      return await setCustomerStatus(c.id, next);
    },
    rollback: (snap) => {
      props.patchCustomerLocal(c.id, { status: snap.prevStatus });
      if (modalCustomer.value?.id === c.id) {
        modalCustomer.value = { ...modalCustomer.value, status: snap.prevStatus as any };
      }
    },
    onSuccess: (res) => {
      if (res?.status) props.patchCustomerLocal(c.id, { status: res.status as any });
    },
    toast: {
      success: {
        title: next === "active" ? "Customer ativado" : "Customer inativado",
        message: next === "active" ? `${c.code} foi ativado.` : `${c.code} foi inativado.`,
      },
      error: {
        title: next === "active" ? "Falha ao ativar customer" : "Falha ao inativar customer",
      },
    },
  });

  await loadCustomerSummary();
  await loadCatalog();
}

async function saveCustomer() {
  if (!canSubmit.value) return;

  const payload = {
    code: form.code.trim(),
    name: form.name.trim(),
  };

  modalSaving.value = true;

  try {
    if (!modalCustomer.value) {
      const created = await createCustomer({ code: payload.code, name: payload.name, status: "active" });
      props.upsertCustomerLocal(created);
      modalCustomer.value = created;
      push({ kind: "success", title: "Customer criado", message: `${created.code} — ${created.name}` });
      await loadCustomerSummary();
      await loadCatalog();
      return;
    }

    const target = modalCustomer.value;
    const prev = { code: target.code, name: target.name };

    await mutate<typeof prev, { ok: boolean; customer: CustomerRow }>({
      key: target.id,
      busy,
      optimistic: () => {
        props.patchCustomerLocal(target.id, { code: payload.code, name: payload.name });
        modalCustomer.value = { ...target, code: payload.code, name: payload.name };
        return prev;
      },
      request: async () => {
        return await updateCustomer(target.id, { code: payload.code, name: payload.name });
      },
      rollback: (snap) => {
        props.patchCustomerLocal(target.id, { code: snap.code, name: snap.name });
        modalCustomer.value = { ...target, code: snap.code, name: snap.name };
      },
      onSuccess: (res) => {
        if (res?.customer) {
          props.upsertCustomerLocal(res.customer);
          modalCustomer.value = res.customer;
        }
      },
      toast: {
        success: { title: "Customer atualizado", message: `${payload.code} — ${payload.name}` },
        error: { title: "Falha ao atualizar customer" },
      },
    });
  } catch (e: any) {
    const ne = normalizeApiError(e);
    push({
      kind: "error",
      title: "Falha ao salvar customer",
      message: ne.message,
      details: ne.details,
      timeoutMs: 9000,
    });
  } finally {
    modalSaving.value = false;
  }
}

// ---------- summary ----------
const summary = ref<CustomerSummary | null>(null);
const summaryLoading = ref(false);

async function loadCustomerSummary() {
  if (!modalCustomer.value) return;
  summaryLoading.value = true;
  try {
    summary.value = await getCustomerSummary(modalCustomer.value.id);
  } catch (e: any) {
    const ne = normalizeApiError(e);
    push({ kind: "error", title: "Falha ao carregar resumo", message: ne.message });
  } finally {
    summaryLoading.value = false;
  }
}

// ---------- reports / catalog ----------
const catalog = ref<CustomerCatalog | null>(null);
const loadingCatalog = ref(false);
const catalogError = ref("");
const syncing = ref(false);
const catalogLoaded = ref(false);
const catalogSyncAttempted = ref(false);

const busyWorkspacePerm = useBusyMap();
const busyReportPerm = useBusyMap();

const catalogWorkspaces = computed(() => catalog.value?.workspaces ?? []);
const showCatalogSkeleton = computed(
  () =>
    !catalogWorkspaces.value.length &&
    (loadingCatalog.value || syncing.value || !catalogLoaded.value),
);

function cloneCatalog<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function loadCatalog(opts?: { silent?: boolean }) {
  if (!modalCustomer.value) return;
  if (!opts?.silent) {
    loadingCatalog.value = true;
  }
  catalogError.value = "";
  catalogLoaded.value = false;
  try {
    catalog.value = await getPowerBiCatalog(modalCustomer.value.id);
  } catch (e: any) {
    const ne = normalizeApiError(e);
    catalogError.value = ne.message;
    push({ kind: "error", title: "Falha ao carregar catalogo", message: ne.message });
  } finally {
    if (!opts?.silent) {
      loadingCatalog.value = false;
    }
    catalogLoaded.value = true;
  }
}

async function syncCatalog(opts?: { silent?: boolean }) {
  if (!modalCustomer.value || syncing.value) return;

  syncing.value = true;
  try {
    await syncPowerBiCatalog({ customerId: modalCustomer.value.id, deactivateMissing: true });
    await loadCatalog({ silent: true });
    if (!opts?.silent) {
      push({ kind: "success", title: "Sync concluido", message: "Catalogo atualizado." });
    }
  } catch (e: any) {
    const ne = normalizeApiError(e);
    catalogError.value = ne.message;
    if (!opts?.silent) {
      push({ kind: "error", title: "Falha no sync", message: ne.message, details: ne.details });
    }
  } finally {
    syncing.value = false;
  }
}

async function ensureCatalog() {
  if (!modalCustomer.value) return;
  await loadCatalog();
  if (!catalogWorkspaces.value.length && !catalogSyncAttempted.value) {
    catalogSyncAttempted.value = true;
    await syncCatalog({ silent: true });
  }
}

async function runSync() {
  if (!modalCustomer.value) return;
  await syncCatalog({ silent: false });
}

async function toggleWorkspaceAccess(workspace: CustomerCatalog["workspaces"][number]) {
  const customerId = modalCustomer.value?.id;
  if (!customerId) return;
  const nextCanView = !workspace.isActive;

  await mutate({
    key: workspace.workspaceRefId,
    busy: busyWorkspacePerm,
    optimistic: () => {
      if (!catalog.value) return null;
      const next = cloneCatalog(catalog.value);
      next.workspaces = next.workspaces.map((w) => {
        if (w.workspaceRefId !== workspace.workspaceRefId) return w;
        return {
          ...w,
          isActive: nextCanView,
          reports: w.reports.map((r) => ({
            ...r,
            canView: nextCanView ? true : false,
          })),
        };
      });
      catalog.value = next;
      return null;
    },
    request: async () => setCustomerWorkspacePermission(customerId, workspace.workspaceRefId, {
      canView: nextCanView,
      restoreReports: nextCanView,
    }),
    rollback: () => {
      void loadCatalog();
    },
    toast: {
      success: { title: "Workspace atualizado", message: `${workspace.name}: ${nextCanView ? "ON" : "OFF"}` },
      error: { title: "Falha ao atualizar workspace" },
    },
  });

  await loadCustomerSummary();
}

async function toggleReportAccess(workspaceRefId: string, reportRefId: string) {
  const customerId = modalCustomer.value?.id;
  if (!customerId || !catalog.value) return;

  const ws = catalog.value.workspaces.find((w) => w.workspaceRefId === workspaceRefId);
  const report = ws?.reports.find((r) => r.reportRefId === reportRefId);
  if (!ws || !report) return;

  const nextCanView = !report.canView;

  await mutate({
    key: reportRefId,
    busy: busyReportPerm,
    optimistic: () => {
      if (!catalog.value) return null;
      const next = cloneCatalog(catalog.value);
      next.workspaces = next.workspaces.map((w) => {
        if (w.workspaceRefId !== workspaceRefId) return w;
        return {
          ...w,
          isActive: nextCanView ? true : w.isActive,
          reports: w.reports.map((r) =>
            r.reportRefId === reportRefId ? { ...r, canView: nextCanView } : r,
          ),
        };
      });
      catalog.value = next;
      return null;
    },
    request: async () => setCustomerReportPermission(customerId, reportRefId, nextCanView),
    rollback: () => {
      void loadCatalog();
    },
    toast: {
      success: { title: "Report atualizado", message: `${report.name}: ${nextCanView ? "ON" : "OFF"}` },
      error: { title: "Falha ao atualizar report" },
    },
  });

  await loadCustomerSummary();
}

// ---------- pages ----------
const pageReportRefId = ref("");
const pageAccessPages = ref<Array<ReportPage & { canView?: boolean }>>([]);
const pageGroupsWithAccess = ref<Array<PageGroup & { assigned?: boolean }>>([]);
const pageError = ref("");
const syncingPages = ref(false);
const pagesLoading = ref(false);

const busyPageAllow = useBusyMap();
const busyGroupAssign = useBusyMap();

const selectedPageIds = ref(new Set<string>());
const selectedGroupIds = ref(new Set<string>());

  const pageReportOptions = computed(() => {
    return (catalog.value?.workspaces ?? []).flatMap((w) =>
      (w.reports ?? [])
        .filter((r) => r.isActive && r.canView)
        .map((r) => ({
          reportRefId: r.reportRefId,
          label: `${w.name} / ${r.name}`,
        })),
    );
  });

const hasActiveGroupAssignments = computed(() =>
  pageGroupsWithAccess.value.some((g) => g.assigned),
);

const hasPreviewSelection = computed(() =>
  selectedPageIds.value.size > 0 || selectedGroupIds.value.size > 0,
);

function collectGroupPageIds(): string[] {
  const selectedGroups = pageGroupsWithAccess.value.filter((g) => selectedGroupIds.value.has(g.id));
  return selectedGroups.flatMap((g) => g.pageIds ?? []);
}

watch(pageReportOptions, () => {
  if (!pageReportRefId.value && pageReportOptions.value.length > 0) {
    pageReportRefId.value = pageReportOptions.value[0]?.reportRefId ?? "";
  }
});

  watch(
    () => modalCustomer.value?.id,
    () => {
      pageReportRefId.value = "";
      pageAccessPages.value = [];
      pageGroupsWithAccess.value = [];
      selectedPageIds.value = new Set();
      selectedGroupIds.value = new Set();
      previewReportRefId.value = "";
      resetPreviewTab();
      catalogLoaded.value = false;
      catalogSyncAttempted.value = false;
    },
  );
  
  watch(modalTab, async (tab) => {
    if (!modalCustomer.value) return;
    if (tab === "reports") {
      await ensureCatalog();
    }
  if (tab === "pages") {
    if (!pageReportRefId.value && pageReportOptions.value.length > 0) {
      pageReportRefId.value = pageReportOptions.value[0]?.reportRefId ?? "";
    } else if (pageReportRefId.value) {
      void loadPageConfig();
      void syncPagesInternal({ silent: true });
    }
  }
  if (tab === "preview") {
    void loadCatalog();
    void syncCatalog({ silent: true });
    if (!previewReportRefId.value && pageReportOptions.value.length > 0) {
      previewReportRefId.value = pageReportOptions.value[0]?.reportRefId ?? "";
    }
    if (previewReportRefId.value) {
      void loadCustomerPreview();
    }
  }
});

watch(pageReportRefId, () => {
  selectedPageIds.value = new Set();
  selectedGroupIds.value = new Set();
  pageAccessPages.value = [];
  pageGroupsWithAccess.value = [];
  if (pageReportRefId.value) {
    void loadPageConfig();
    void syncPagesInternal({ silent: true });
  }
});

watch(pageReportOptions, () => {
  if (!previewReportRefId.value && pageReportOptions.value.length > 0) {
    previewReportRefId.value = pageReportOptions.value[0]?.reportRefId ?? "";
  }
});

watch(previewReportRefId, () => {
  if (modalTab.value === "preview" && previewReportRefId.value) {
    void loadCustomerPreview();
  }
});

async function loadPageConfig() {
  if (!modalCustomer.value || !pageReportRefId.value) return;
  pageError.value = "";
  pagesLoading.value = true;
  try {
    const [pagesRes, groupsRes, accessRes] = await Promise.all([
      listReportPages(pageReportRefId.value),
      listPageGroups(pageReportRefId.value),
      getCustomerPageAccess(modalCustomer.value.id, pageReportRefId.value),
    ]);

    const activePages = pagesRes.filter((p) => p.isActive);
    pageAccessPages.value = activePages.map((p) => {
      const match = accessRes.pages.find((x) => x.id === p.id);
      return { ...p, canView: match?.canView ?? false };
    });

    pageGroupsWithAccess.value = groupsRes.map((g) => {
      const match = accessRes.groups.find((x) => x.id === g.id);
      return { ...g, assigned: match?.assigned ?? false };
    });
  } catch (e: any) {
    const ne = normalizeApiError(e);
    pageError.value = ne.message;
    push({ kind: "error", title: "Falha ao carregar paginas", message: ne.message });
  } finally {
    pagesLoading.value = false;
  }
}

async function syncPagesInternal(opts?: { silent?: boolean }) {
  if (!pageReportRefId.value || syncingPages.value) return;
  syncingPages.value = true;
  pageError.value = "";
  try {
    await syncReportPages(pageReportRefId.value);
    await loadPageConfig();
    if (!opts?.silent) {
      push({ kind: "success", title: "Paginas sincronizadas", message: "Lista atualizada." });
    }
  } catch (e: any) {
    const ne = normalizeApiError(e);
    pageError.value = ne.message;
    if (!opts?.silent) {
      push({ kind: "error", title: "Falha ao sincronizar paginas", message: ne.message });
    }
  } finally {
    syncingPages.value = false;
  }
}

async function syncPages() {
  await syncPagesInternal({ silent: false });
}

function togglePageSelection(pageId: string) {
  const next = new Set(selectedPageIds.value);
  if (next.has(pageId)) next.delete(pageId);
  else next.add(pageId);
  selectedPageIds.value = next;
}

function toggleGroupSelection(groupId: string) {
  const next = new Set(selectedGroupIds.value);
  if (next.has(groupId)) next.delete(groupId);
  else next.add(groupId);
  selectedGroupIds.value = next;
}

function collectGroupModalPageIds(): string[] {
  const merged = new Set<string>(selectedPageIds.value);
  const groupPageIds = collectGroupPageIds();
  for (const pageId of groupPageIds) {
    merged.add(pageId);
  }
  return Array.from(merged);
}

async function togglePageAllow(page: ReportPage & { canView?: boolean }) {
  if (!modalCustomer.value || hasActiveGroupAssignments.value) return;
  const nextCanView = !page.canView;
  await mutate({
    key: page.id,
    busy: busyPageAllow,
    optimistic: () => {
      pageAccessPages.value = pageAccessPages.value.map((p) =>
        p.id === page.id ? { ...p, canView: nextCanView } : p,
      );
      return null;
    },
    request: async () => setCustomerPageAllow(modalCustomer.value!.id, page.id, nextCanView),
    toast: {
      success: { title: "Pagina atualizada", message: nextCanView ? "ON" : "OFF" },
      error: { title: "Falha ao atualizar pagina" },
    },
    rollback: () => {
      pageAccessPages.value = pageAccessPages.value.map((p) =>
        p.id === page.id ? { ...p, canView: !!page.canView } : p,
      );
    },
    });
  }

  async function selectAllPages() {
    if (!modalCustomer.value || hasActiveGroupAssignments.value) return;
    const toEnable = pageAccessPages.value.filter((p) => !p.canView);
    if (!toEnable.length) return;

    pageAccessPages.value = pageAccessPages.value.map((p) => ({ ...p, canView: true }));
    toEnable.forEach((p) => busyPageAllow.setBusy(p.id, true));

    try {
      await Promise.all(
        toEnable.map((p) => setCustomerPageAllow(modalCustomer.value!.id, p.id, true)),
      );
      push({ kind: "success", title: "Paginas ativadas", message: "Todas as paginas foram liberadas." });
    } catch (e: any) {
      const ne = normalizeApiError(e);
      push({ kind: "error", title: "Falha ao ativar paginas", message: ne.message, details: ne.details });
      await loadPageConfig();
    } finally {
      toEnable.forEach((p) => busyPageAllow.clear(p.id));
    }
  }

async function toggleGroupAssign(group: PageGroup & { assigned?: boolean }) {
  if (!modalCustomer.value) return;
  const nextAssigned = !group.assigned;
  await mutate({
    key: group.id,
    busy: busyGroupAssign,
    optimistic: () => {
      pageGroupsWithAccess.value = pageGroupsWithAccess.value.map((g) =>
        g.id === group.id ? { ...g, assigned: nextAssigned } : g,
      );
      if (nextAssigned) {
        const allowIds = new Set(collectGroupPageIds());
        pageAccessPages.value = pageAccessPages.value.map((p) => ({
          ...p,
          canView: allowIds.has(p.id),
        }));
      }
      return null;
    },
    request: async () => setCustomerPageGroup(modalCustomer.value!.id, group.id, nextAssigned),
    toast: {
      success: { title: "Grupo aplicado", message: nextAssigned ? "ON" : "OFF" },
      error: { title: "Falha ao aplicar grupo" },
    },
    rollback: () => {
      void loadPageConfig();
    },
  });
}

// ---------- group modal ----------
const groupModalOpen = ref(false);
const groupModalMode = ref<"create" | "edit">("create");
const groupModalName = ref("");
const groupModalPageIds = ref<string[]>([]);
const groupModalError = ref("");
const pageModalSaving = ref(false);
const editingGroupId = ref<string | null>(null);

function openGroupModal(group?: PageGroup) {
  if (!pageReportRefId.value) return;
  groupModalMode.value = group ? "edit" : "create";
  groupModalName.value = group?.name ?? "";
  groupModalPageIds.value = group?.pageIds ? [...group.pageIds] : collectGroupModalPageIds();
  groupModalError.value = "";
  editingGroupId.value = group?.id ?? null;
  groupModalOpen.value = true;
}

function closeGroupModal() {
  if (pageModalSaving.value) return;
  groupModalOpen.value = false;
}

async function saveGroupModal() {
  if (!pageReportRefId.value) return;
  const name = groupModalName.value.trim();
  if (!name) {
    groupModalError.value = "Informe um nome para o grupo.";
    return;
  }

  pageModalSaving.value = true;
  groupModalError.value = "";
  try {
    if (groupModalMode.value === "create") {
      await createPageGroup(pageReportRefId.value, { name, pageIds: groupModalPageIds.value });
    } else if (editingGroupId.value) {
      await updatePageGroup(editingGroupId.value, { name });
      await setPageGroupPages(editingGroupId.value, groupModalPageIds.value);
    }
    await loadPageConfig();
    groupModalOpen.value = false;
    selectedPageIds.value = new Set();
    push({ kind: "success", title: "Grupo salvo", message: name });
  } catch (e: any) {
    const ne = normalizeApiError(e);
    groupModalError.value = ne.message;
    push({ kind: "error", title: "Falha ao salvar grupo", message: ne.message });
  } finally {
    pageModalSaving.value = false;
  }
}

// ---------- preview ----------
const previewOpen = ref(false);
const previewLoading = ref(false);
const previewError = ref("");
const previewContainerEl = ref<HTMLDivElement | null>(null);
const previewPages = ref<Array<{ id: string; pageName: string; displayName: string | null }>>([]);
const previewActivePage = ref<{ id: string; pageName: string; displayName: string | null } | null>(null);
let previewService: pbi.service.Service | null = null;
let previewReport: pbi.Report | null = null;

async function openPreview() {
  if (!pageReportRefId.value || !hasPreviewSelection.value) return;
  if (!modalCustomer.value) return;

  previewOpen.value = true;
  previewLoading.value = true;
  previewError.value = "";

  const groupPageIds = collectGroupPageIds();
  const mergedIds = new Set([...selectedPageIds.value, ...groupPageIds]);
  const selected = pageAccessPages.value.filter((p) => mergedIds.has(p.id));
  previewPages.value = selected.map((p) => ({ id: p.id, pageName: p.pageName, displayName: p.displayName }));
  previewActivePage.value = previewPages.value[0] ?? null;

  try {
    const cfg = await getAdminReportPreview(pageReportRefId.value, { customerId: modalCustomer.value.id });
    await nextTick();
    if (!previewContainerEl.value) throw new Error("Container nao encontrado");
    if (!previewService) {
      previewService = new pbi.service.Service(
        pbi.factories.hpmFactory,
        pbi.factories.wpmpFactory,
        pbi.factories.routerFactory,
      );
    }
    previewService.reset(previewContainerEl.value);
    const embedded = previewService.embed(previewContainerEl.value, {
      type: "report",
      tokenType: pbi.models.TokenType.Embed,
      accessToken: cfg.embedToken,
      embedUrl: cfg.embedUrl,
      id: cfg.reportId,
      pageName: previewActivePage.value?.pageName,
      settings: { panes: { pageNavigation: { visible: false }, filters: { visible: false } } },
    }) as pbi.Report;
    previewReport = embedded;
  } catch (e: any) {
    const ne = normalizeApiError(e);
    previewError.value = ne.message;
  } finally {
    previewLoading.value = false;
  }
}

async function setPreviewPage(page: { id: string; pageName: string; displayName: string | null }) {
  previewActivePage.value = page;
  if (previewReport) {
    try {
      await previewReport.setPage(page.pageName);
    } catch {
      // ignore
    }
  }
}

function closePreview() {
  if (previewService && previewContainerEl.value) {
    previewService.reset(previewContainerEl.value);
  }
  previewOpen.value = false;
  previewPages.value = [];
  previewActivePage.value = null;
  previewError.value = "";
}

// ---------- preview tab ----------
const previewTabPages = ref<ReportPage[]>([]);
const previewTabActivePageName = ref<string | null>(null);
const previewTabLoading = ref(false);
const previewTabError = ref("");
const previewTabEmpty = ref(false);
const previewTabContainerEl = ref<HTMLDivElement | null>(null);
let previewTabService: pbi.service.Service | null = null;
let previewTabReport: pbi.Report | null = null;
let previewTabGuard: ((event: any) => void) | null = null;

function clearPreviewTabEmbed() {
  if (previewTabService && previewTabContainerEl.value) {
    previewTabService.reset(previewTabContainerEl.value);
  }
  if (previewTabReport && previewTabGuard) {
    previewTabReport.off("pageChanged");
  }
  previewTabReport = null;
  previewTabGuard = null;
}

function resetPreviewTab() {
  clearPreviewTabEmbed();
  previewTabPages.value = [];
  previewTabActivePageName.value = null;
  previewTabError.value = "";
  previewTabLoading.value = false;
  previewTabEmpty.value = false;
}

  async function loadCustomerPreview() {
    if (!modalCustomer.value || !previewReportRefId.value) return;
    previewTabLoading.value = true;
    previewTabError.value = "";
    previewTabEmpty.value = false;
    clearPreviewTabEmbed();

    try {
      let sourcePages: ReportPage[] | null = null;
      if (pageReportRefId.value === previewReportRefId.value && pageAccessPages.value.length) {
        sourcePages = pageAccessPages.value;
      } else {
        const access = await getCustomerPageAccess(modalCustomer.value.id, previewReportRefId.value);
        sourcePages = access.pages;
      }

      const allowed = (sourcePages ?? []).filter((p) => p.canView);

      previewTabPages.value = allowed;
      previewTabActivePageName.value = allowed[0]?.pageName ?? null;

      if (!previewTabActivePageName.value) {
      previewTabEmpty.value = true;
      return;
    }

    const cfg = await getAdminReportPreview(previewReportRefId.value, { customerId: modalCustomer.value.id });
    await nextTick();
    if (!previewTabContainerEl.value) throw new Error("Container nao encontrado");
    if (!previewTabService) {
      previewTabService = new pbi.service.Service(
        pbi.factories.hpmFactory,
        pbi.factories.wpmpFactory,
        pbi.factories.routerFactory,
      );
    }
    previewTabService.reset(previewTabContainerEl.value);
    previewTabReport = previewTabService.embed(previewTabContainerEl.value, {
      type: "report",
      tokenType: pbi.models.TokenType.Embed,
      accessToken: cfg.embedToken,
      embedUrl: cfg.embedUrl,
      id: cfg.reportId,
      pageName: previewTabActivePageName.value ?? undefined,
      settings: { panes: { pageNavigation: { visible: false }, filters: { visible: false } } },
    }) as pbi.Report;

    if (previewTabGuard) {
      previewTabReport.off("pageChanged");
    }
    previewTabGuard = async (event: any) => {
      const pageName = event?.detail?.newPage?.name ?? event?.detail?.newPage?.pageName;
      if (!pageName) return;
      if (previewTabPages.value.some((p) => p.pageName === pageName)) {
        previewTabActivePageName.value = pageName;
        return;
      }
      const fallback = previewTabPages.value[0]?.pageName;
      if (fallback && previewTabReport) {
        try {
          await previewTabReport.setPage(fallback);
          previewTabActivePageName.value = fallback;
        } catch {
          // ignore
        }
      }
    };
    previewTabReport.on("pageChanged", previewTabGuard);
  } catch (e: any) {
    const ne = normalizeApiError(e);
    previewTabError.value = ne.message;
  } finally {
    previewTabLoading.value = false;
  }
}

async function setPreviewTabPage(pageName: string) {
  if (!previewTabPages.value.some((p) => p.pageName === pageName)) return;
  previewTabActivePageName.value = pageName;
  if (previewTabReport) {
    try {
      await previewTabReport.setPage(pageName);
    } catch {
      // ignore
    }
  }
}
</script>
