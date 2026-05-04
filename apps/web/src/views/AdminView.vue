<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden p-4 md:p-6">
    <div class="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      <section class="flex min-h-0 flex-col border-b border-border xl:border-b-0 xl:border-r">
        <div class="flex items-center gap-2 border-b border-border px-4 py-3">
          <UiInput v-model="newOrgName" placeholder="Nova organização" @keyup.enter="createOrg" />
          <UiButton size="icon" :disabled="!newOrgName.trim() || savingOrg" @click="createOrg">
            <Plus class="h-4 w-4" />
          </UiButton>
        </div>
        <div class="min-h-0 flex-1 overflow-auto p-3">
          <UiSkeleton v-if="loadingOrgs" class="h-20 rounded-2xl" />
          <button
            v-for="org in orgs"
            v-else
            :key="org.id"
            type="button"
            class="mb-2 w-full rounded-2xl border px-4 py-3 text-left transition hover:bg-muted"
            :class="selectedOrg?.id === org.id ? 'border-foreground bg-muted' : 'border-border bg-background'"
            @click="selectOrg(org)"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="truncate text-sm font-semibold text-foreground">{{ org.name }}</span>
              <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                :class="org.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'"
              >
                {{ org.status === 'active' ? 'Ativa' : 'Inativa' }}
              </span>
            </div>
            <div class="mt-1 truncate text-xs text-muted-foreground">{{ org.slug }}</div>
          </button>
          <div v-if="!loadingOrgs && orgs.length === 0" class="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
            Nenhuma organização.
          </div>
        </div>
      </section>

      <section class="flex min-h-0 flex-col border-b border-border xl:border-b-0 xl:border-r">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div class="min-w-0 text-sm font-semibold text-foreground">
            {{ selectedOrg?.name ?? 'Selecione uma organização' }}
          </div>
          <div v-if="selectedOrg" class="flex items-center gap-2">
            <UiButton variant="outline" size="sm" @click="toggleOrgStatus">
              {{ selectedOrg.status === 'active' ? 'Desativar' : 'Ativar' }}
            </UiButton>
            <UiButton size="sm" @click="memberDialogOpen = true">
              <Plus class="mr-2 h-4 w-4" />
              Membro
            </UiButton>
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-auto p-4">
          <UiSkeleton v-if="loadingMemberships" class="h-24 rounded-2xl" />
          <div v-else-if="!selectedOrg" class="grid h-full place-items-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
            Escolha uma organização.
          </div>
          <div v-else-if="memberships.length === 0" class="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
            Sem membros.
          </div>
          <div v-else class="space-y-3">
            <article
              v-for="membership in memberships"
              :key="membership.userId"
              class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4"
            >
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-foreground">
                  {{ membership.user?.displayName || membership.user?.email || membership.userId }}
                </div>
                <div class="truncate text-xs text-muted-foreground">
                  {{ membership.user?.email || membership.userId }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UiSelect
                  class="w-28"
                  :model-value="membership.role"
                  @update:model-value="updateRole(membership.userId, $event as AdminMembershipRow['role'])"
                >
                  <option value="owner">owner</option>
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                </UiSelect>
                <UiButton variant="outline" size="icon" class="border-destructive/30 text-destructive hover:bg-destructive/10" @click="removeMember(membership.userId)">
                  <Trash2 class="h-4 w-4" />
                </UiButton>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="flex min-h-0 flex-col">
        <div class="border-b border-border px-4 py-3">
          <UiInput v-model="userQuery" placeholder="Buscar usuário" />
        </div>
        <div class="min-h-0 flex-1 overflow-auto p-3">
          <UiSkeleton v-if="loadingUsers" class="h-20 rounded-2xl" />
          <article
            v-for="user in users"
            v-else
            :key="user.id"
            class="mb-2 rounded-2xl border border-border bg-background px-4 py-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-foreground">{{ user.displayName || user.email || user.id }}</div>
                <div class="truncate text-xs text-muted-foreground">{{ user.email || user.identityUserId || user.id }}</div>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    :class="user.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700'
                      : user.status === 'pending'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-rose-50 text-rose-700'"
                  >
                    {{ user.status === 'active' ? 'Ativo' : user.status === 'pending' ? 'Pendente' : 'Desativado' }}
                  </span>
                  <span v-for="membership in user.memberships" :key="`${user.id}-${membership.orgId}`" class="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {{ membership.org?.name || membership.orgId }} · {{ membership.role }}
                  </span>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <UiButton
                  v-if="user.status !== 'active'"
                  size="sm"
                  :disabled="orgs.length === 0"
                  @click="openActivateUser(user)"
                >
                  Ativar
                </UiButton>
                <UiButton
                  v-else
                  variant="outline"
                  size="sm"
                  class="border-destructive/30 text-destructive hover:bg-destructive/10"
                  @click="disableUser(user)"
                >
                  Desativar
                </UiButton>
              </div>
            </div>
          </article>
          <div v-if="!loadingUsers && users.length === 0" class="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
            Nenhum usuário.
          </div>
        </div>
      </section>
    </div>

    <UiDialog :open="memberDialogOpen" max-width-class="max-w-lg" @close="memberDialogOpen = false">
      <div class="border-b border-border px-6 py-5">
        <div class="flex items-center justify-between gap-3">
          <div class="text-lg font-semibold text-foreground">Adicionar membro</div>
          <UiButton variant="ghost" size="icon" @click="memberDialogOpen = false">
            <X class="h-4 w-4" />
          </UiButton>
        </div>
      </div>
      <div class="space-y-4 px-6 py-5">
        <UiInput v-model="candidateQuery" placeholder="Nome ou email" />
        <UiSelect v-model="memberRole">
          <option value="member">member</option>
          <option value="admin">admin</option>
          <option value="owner">owner</option>
        </UiSelect>
        <div class="max-h-[360px] overflow-auto rounded-2xl border border-border">
          <button
            v-for="user in memberCandidates"
            :key="user.id"
            type="button"
            class="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted"
            @click="addMember(user.id)"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold text-foreground">{{ user.displayName || user.email || user.id }}</span>
              <span class="block truncate text-xs text-muted-foreground">{{ user.email || user.identityUserId || user.id }}</span>
            </span>
            <Plus class="h-4 w-4 text-muted-foreground" />
          </button>
          <div v-if="memberCandidates.length === 0" class="px-4 py-6 text-sm text-muted-foreground">Nenhum usuário.</div>
        </div>
      </div>
    </UiDialog>

    <UiDialog :open="userStatusDialogOpen" max-width-class="max-w-lg" @close="closeUserStatusDialog">
      <div class="border-b border-border px-6 py-5">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-lg font-semibold text-foreground">Ativar usuário</div>
            <div class="mt-1 text-sm text-muted-foreground">
              {{ selectedUserForStatus?.displayName || selectedUserForStatus?.email || selectedUserForStatus?.id }}
            </div>
          </div>
          <UiButton variant="ghost" size="icon" @click="closeUserStatusDialog">
            <X class="h-4 w-4" />
          </UiButton>
        </div>
      </div>
      <div class="space-y-4 px-6 py-5">
        <div class="space-y-2">
          <div class="text-sm font-medium text-foreground">Organização inicial</div>
          <UiSelect v-model="activationOrgId">
            <option disabled value="">Selecione uma organização</option>
            <option v-for="org in orgs" :key="org.id" :value="org.id">
              {{ org.name }}
            </option>
          </UiSelect>
        </div>
        <div class="space-y-2">
          <div class="text-sm font-medium text-foreground">Perfil</div>
          <UiSelect v-model="activationRole">
            <option value="member">member</option>
            <option value="admin">admin</option>
            <option value="owner">owner</option>
          </UiSelect>
        </div>
        <div class="text-xs text-muted-foreground">
          Ativação cria ou atualiza membership na organização escolhida.
        </div>
      </div>
      <div class="flex justify-end gap-2 border-t border-border px-6 py-4">
        <UiButton variant="outline" @click="closeUserStatusDialog">Cancelar</UiButton>
        <UiButton
          :disabled="!selectedUserForStatus || !activationOrgId"
          @click="activateUser"
        >
          Confirmar ativação
        </UiButton>
      </div>
    </UiDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Plus, Trash2, X } from 'lucide-vue-next';
import { Button as UiButton, Dialog as UiDialog, Input as UiInput, Select as UiSelect, Skeleton as UiSkeleton, useToast } from '@/components/ui';
import {
  addAdminMembership,
  createAdminOrg,
  listAdminMemberships,
  listAdminOrgs,
  listAdminUsers,
  removeAdminMembership,
  updateAdminUserStatus,
  updateAdminMembership,
  updateAdminOrg,
} from '@/features/attachments/api';
import type { AdminMembershipRow, AdminOrgRow, AdminUserRow } from '@/features/attachments/types';

const { push: pushToast } = useToast();

const orgs = ref<AdminOrgRow[]>([]);
const users = ref<AdminUserRow[]>([]);
const memberships = ref<AdminMembershipRow[]>([]);
const selectedOrg = ref<AdminOrgRow | null>(null);
const newOrgName = ref('');
const userQuery = ref('');
const candidateQuery = ref('');
const memberRole = ref<AdminMembershipRow['role']>('member');
const memberDialogOpen = ref(false);
const loadingOrgs = ref(false);
const loadingUsers = ref(false);
const loadingMemberships = ref(false);
const savingOrg = ref(false);
const userStatusDialogOpen = ref(false);
const selectedUserForStatus = ref<AdminUserRow | null>(null);
const activationOrgId = ref('');
const activationRole = ref<AdminMembershipRow['role']>('member');
let userDebounce: number | undefined;
let candidateDebounce: number | undefined;

const memberCandidates = computed(() => {
  const existing = new Set(memberships.value.map((item) => item.userId));
  const query = candidateQuery.value.trim().toLowerCase();
  return users.value.filter((user) => {
    if (existing.has(user.id)) return false;
    if (!query) return true;
    return [user.email, user.displayName, user.identityUserId, user.id]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
});

async function loadOrgs() {
  loadingOrgs.value = true;
  try {
    orgs.value = await listAdminOrgs();
    if (!selectedOrg.value && orgs.value[0]) {
      await selectOrg(orgs.value[0]);
    }
  } catch (error: any) {
    pushToast({ kind: 'error', title: 'Admin indisponível', message: error?.response?.data?.error?.message ?? 'Não foi possível carregar organizações.' });
  } finally {
    loadingOrgs.value = false;
  }
}

async function loadUsers() {
  loadingUsers.value = true;
  try {
    users.value = await listAdminUsers(userQuery.value);
  } finally {
    loadingUsers.value = false;
  }
}

async function loadCandidateUsers() {
  loadingUsers.value = true;
  try {
    users.value = await listAdminUsers(candidateQuery.value);
  } finally {
    loadingUsers.value = false;
  }
}

async function loadMemberships() {
  if (!selectedOrg.value) {
    memberships.value = [];
    return;
  }
  loadingMemberships.value = true;
  try {
    memberships.value = await listAdminMemberships(selectedOrg.value.id);
  } finally {
    loadingMemberships.value = false;
  }
}

async function selectOrg(org: AdminOrgRow) {
  selectedOrg.value = org;
  await loadMemberships();
}

async function createOrg() {
  const name = newOrgName.value.trim();
  if (!name) return;
  savingOrg.value = true;
  try {
    const org = await createAdminOrg({ name });
    newOrgName.value = '';
    await loadOrgs();
    await selectOrg(org);
  } finally {
    savingOrg.value = false;
  }
}

async function toggleOrgStatus() {
  if (!selectedOrg.value) return;
  const nextStatus = selectedOrg.value.status === 'active' ? 'disabled' : 'active';
  const updated = await updateAdminOrg(selectedOrg.value.id, { status: nextStatus });
  selectedOrg.value = updated;
  orgs.value = orgs.value.map((org) => (org.id === updated.id ? updated : org));
}

async function addMember(userId: string) {
  if (!selectedOrg.value) return;
  await addAdminMembership(selectedOrg.value.id, { userId, role: memberRole.value });
  memberDialogOpen.value = false;
  candidateQuery.value = '';
  await loadMemberships();
}

async function updateRole(userId: string, role: AdminMembershipRow['role']) {
  if (!selectedOrg.value) return;
  await updateAdminMembership(selectedOrg.value.id, userId, { userId, role });
  await loadMemberships();
}

async function removeMember(userId: string) {
  if (!selectedOrg.value) return;
  await removeAdminMembership(selectedOrg.value.id, userId);
  await loadMemberships();
}

function closeUserStatusDialog() {
  userStatusDialogOpen.value = false;
  selectedUserForStatus.value = null;
  activationOrgId.value = '';
  activationRole.value = 'member';
}

function openActivateUser(user: AdminUserRow) {
  selectedUserForStatus.value = user;
  activationOrgId.value = selectedOrg.value?.id ?? user.memberships[0]?.orgId ?? '';
  activationRole.value = user.memberships[0]?.role ?? 'member';
  userStatusDialogOpen.value = true;
}

async function activateUser() {
  if (!selectedUserForStatus.value || !activationOrgId.value) return;
  await updateAdminUserStatus(selectedUserForStatus.value.id, {
    status: 'active',
    orgId: activationOrgId.value,
    role: activationRole.value,
  });
  closeUserStatusDialog();
  await Promise.all([loadUsers(), loadMemberships()]);
  pushToast({
    kind: 'success',
    title: 'Usuário ativado',
    message: 'Acesso liberado com organização inicial.',
  });
}

async function disableUser(user: AdminUserRow) {
  await updateAdminUserStatus(user.id, { status: 'disabled' });
  await Promise.all([loadUsers(), loadMemberships()]);
  pushToast({
    kind: 'success',
    title: 'Usuário desativado',
    message: 'Acesso bloqueado até nova ativação.',
  });
}

watch(userQuery, () => {
  window.clearTimeout(userDebounce);
  userDebounce = window.setTimeout(() => void loadUsers(), 300);
});

watch(candidateQuery, () => {
  window.clearTimeout(candidateDebounce);
  candidateDebounce = window.setTimeout(() => void loadCandidateUsers(), 300);
});

watch(memberDialogOpen, (open) => {
  if (open) void loadCandidateUsers();
});

onMounted(async () => {
  await Promise.all([loadOrgs(), loadUsers()]);
});
</script>
