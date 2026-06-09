<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import AuditPanel from '../components/AuditPanel.vue'
import AuthSessionsPanel from '../components/AuthSessionsPanel.vue'
import CrudPanel from '../components/CrudPanel.vue'
import RunningCommands from '../components/RunningCommands.vue'
import ScopeFilterBar from '../components/ScopeFilterBar.vue'
import SessionHistory from '../components/SessionHistory.vue'
import { apiRequest } from '../lib/api'
import { resolveProject } from '../lib/scope'
import { authStore } from '../stores/auth'

const router = useRouter()
const currentSection = ref('servers')
const teams = ref([])
const projects = ref([])
const filtersLoading = ref(true)
const filtersError = ref('')
const selectedTeamId = ref('')
const selectedProjectId = ref('')
const searchQuery = ref('')

const sections = [
  { id: 'servers', label: 'Servers', hint: 'Инвентарь серверов и SSH статус' },
  { id: 'stream', label: 'Stream', hint: 'Запуск команд и live terminals' },
  { id: 'history', label: 'History', hint: 'Все command sessions и логи' },
  { id: 'teams', label: 'Teams', hint: 'Команды и ownership' },
  { id: 'projects', label: 'Projects', hint: 'Проекты и связь с командами' },
  { id: 'users', label: 'Users', hint: 'Роли и локальные пароли' },
  { id: 'auth-sessions', label: 'Auth Sessions', hint: 'Login sessions и revoke' },
  { id: 'audit', label: 'Audit', hint: 'Auth и exec события' },
]

const user = computed(() => authStore.state.user || {})
const showScopeFilters = computed(() => currentSection.value !== 'teams')

function logout() {
  authStore.logout().finally(() => router.push('/login'))
}

function buildScopeQuery(extra = {}) {
  return {
    ...extra,
    ...(selectedTeamId.value ? { team_id: selectedTeamId.value } : {}),
    ...(selectedProjectId.value ? { project_id: selectedProjectId.value } : {}),
  }
}

function openRunning(item) {
  router.push({
    path: '/stream',
    query: buildScopeQuery({
      stream_id: item.stream_id,
      request_id: item.request_id,
      server: item.server,
    }),
  })
}

function openWorkspace() {
  router.push({ path: '/stream', query: buildScopeQuery() })
}

function updateTeamFilter(value) {
  selectedTeamId.value = value
  if (!selectedProjectId.value) {
    return
  }
  const project = resolveProject(projects.value, selectedProjectId.value)
  if (project && String(project.team_id) !== String(value)) {
    selectedProjectId.value = ''
  }
}

function updateProjectFilter(value) {
  selectedProjectId.value = value
  const project = resolveProject(projects.value, value)
  if (project) {
    selectedTeamId.value = String(project.team_id)
  }
}

async function loadScopeOptions() {
  filtersLoading.value = true
  filtersError.value = ''
  try {
    const [teamPayload, projectPayload] = await Promise.all([
      apiRequest('/api/v1/teams'),
      apiRequest('/api/v1/projects'),
    ])
    teams.value = Array.isArray(teamPayload) ? teamPayload : teamPayload.items || []
    projects.value = Array.isArray(projectPayload) ? projectPayload : projectPayload.items || []
  } catch (err) {
    filtersError.value = err.message
  } finally {
    filtersLoading.value = false
  }
}

onMounted(() => {
  loadScopeOptions()
})

const teamSource = [{ name: 'teams', endpoint: '/api/v1/teams' }]
const projectSources = [{ name: 'teams', endpoint: '/api/v1/teams' }]
const serverSources = [
  { name: 'teams', endpoint: '/api/v1/teams' },
  { name: 'projects', endpoint: '/api/v1/projects' },
  { name: 'proxies', endpoint: '/api/v1/proxies' },
]

const crudConfigs = {
  teams: {
    title: 'Teams',
    description: 'Команда объединяет пользователей и проекты. Список справа показывает, что уже прикреплено к каждой команде.',
    endpoint: '/api/v1/teams',
    itemLabel: 'team',
    fields: [
      { name: 'name', label: 'Name' },
      { name: 'slug', label: 'Slug' },
      { name: 'user_count', label: 'Users', optional: true, form: false },
      { name: 'project_count', label: 'Projects', optional: true, form: false },
      { name: 'user_names', label: 'Attached users', optional: true, form: false },
      { name: 'project_names', label: 'Attached projects', optional: true, form: false },
      { name: 'created_at', label: 'Created', optional: true, list: false, form: false },
    ],
  },
  projects: {
    title: 'Projects',
    description: 'Каждый проект принадлежит одной команде и потом может использоваться в серверном инвентаре.',
    endpoint: '/api/v1/projects',
    itemLabel: 'project',
    sources: projectSources,
    scopeItemKind: 'project',
    fields: [
      { name: 'name', label: 'Name' },
      { name: 'slug', label: 'Slug' },
      {
        name: 'team_id',
        label: 'Team',
        type: 'select',
        optionsSource: 'teams',
        optionValue: 'id',
        optionLabel: 'name',
        valueType: 'number',
      },
      { name: 'team_name', label: 'Team name', optional: true, form: false },
      { name: 'created_at', label: 'Created', optional: true, list: false, form: false },
    ],
  },
  users: {
    title: 'User directory',
    description: 'Локальные пользователи, роли и пароли для dev/staging запуска.',
    endpoint: '/api/v1/users',
    itemLabel: 'user',
    sources: teamSource,
    fields: [
      { name: 'username', label: 'Username' },
      { name: 'email', label: 'Email', type: 'email' },
      {
        name: 'role',
        label: 'Role',
        type: 'select',
        default: 'engineer',
        options: [
          { value: 'engineer', label: 'engineer' },
          { value: 'tl', label: 'tl' },
          { value: 'pm', label: 'pm' },
          { value: 'superadmin', label: 'superadmin' },
        ],
      },
      {
        name: 'team_id',
        label: 'Team',
        type: 'select',
        optionsSource: 'teams',
        optionValue: 'id',
        optionLabel: 'name',
        valueType: 'number',
        optional: true,
        list: false,
      },
      { name: 'team_name', label: 'Team', optional: true, form: false },
      { name: 'password', label: 'Password', type: 'password', optional: true, list: false },
      { name: 'is_active', label: 'Enabled', type: 'checkbox', default: true, checkboxLabel: 'User active' },
      { name: 'public_key', label: 'Public key', type: 'textarea', optional: true, list: false },
      { name: 'last_login', label: 'Last login', optional: true, list: false, form: false },
    ],
  },
  servers: {
    title: 'Server inventory',
    description: 'Каждый сервер закреплён за командой и может быть привязан к SSH proxy из базы.',
    endpoint: '/api/v1/admin/servers',
    itemLabel: 'server',
    sources: serverSources,
    hideUntilScoped: true,
    emptyScopedMessage: 'Select a team or project to show servers.',
    statusEndpoint: '/api/v1/ssh/status',
    showStatusColumn: true,
    statusColumnLabel: 'SSH',
    allowStatusToggle: true,
    sortMode: 'kubeMasterFirst',
    fields: [
      { name: 'name', label: 'Name', copyOnClick: true },
      { name: 'host', label: 'Host', copyOnClick: true },
      {
        name: 'type',
        label: 'Type',
        type: 'select',
        optional: true,
        sendNullOnEmpty: true,
        options: [
          { value: 'kube-master', label: 'kube-master' },
        ],
      },
      { name: 'ip', label: 'IP', optional: true, list: false },
      {
        name: 'team_id',
        label: 'Team',
        type: 'select',
        optionsSource: 'teams',
        optionValue: 'id',
        optionLabel: 'name',
        valueType: 'number',
        optional: true,
        list: false,
      },
      {
        name: 'project_id',
        label: 'Project',
        type: 'select',
        optionsSource: 'projects',
        optionValue: 'id',
        optionLabel: 'name',
        valueType: 'number',
        optional: true,
        list: false,
      },
      {
        name: 'proxy_id',
        label: 'Proxy',
        type: 'select',
        optionsSource: 'proxies',
        optionValue: 'id',
        optionLabel: 'proxy',
        valueType: 'number',
        optional: true,
        list: false,
      },
      { name: 'team_name', label: 'Team', optional: true, form: false, list: false },
      { name: 'project_name', label: 'Project', optional: true, form: false, list: false },
      { name: 'proxy_name', label: 'Proxy', optional: true, form: false, list: false },
      { name: 'port', label: 'Port', type: 'number', default: 22, list: false },
      { name: 'environment', label: 'Environment', default: 'dev', list: false },
      { name: 'enabled', label: 'Enabled', type: 'checkbox', default: true, checkboxLabel: 'Server enabled' },
    ],
  },
}
</script>

<template>
  <AppShell
    title="Superadmin console"
    subtitle="Все команды, проекты, серверы, command sessions, auth sessions и аудит в одном интерфейсе."
    :user="user"
    :sections="sections"
    :current-section="currentSection"
    @select="currentSection = $event"
    @logout="logout"
  >
    <div class="stack-layout">
      <ScopeFilterBar
        v-if="showScopeFilters && !filtersLoading"
        :teams="teams"
        :projects="projects"
        :team-id="selectedTeamId"
        :project-id="selectedProjectId"
        :search-query="searchQuery"
        title="Scope"
        description="Use one filter state across servers, stream, history, CRUD lists and audit pages."
        @update:team-id="updateTeamFilter"
        @update:project-id="updateProjectFilter"
        @update:search-query="searchQuery = $event"
      />
      <div v-if="filtersError" class="notice notice--error">{{ filtersError }}</div>

      <CrudPanel
        v-if="currentSection === 'servers'"
        v-bind="crudConfigs.servers"
        :team-id="selectedTeamId"
        :project-id="selectedProjectId"
        :search-query="searchQuery"
        :projects="projects"
      />
      <div v-else-if="currentSection === 'stream'" class="stack-layout">
        <section class="panel">
          <div class="panel__header">
            <div>
              <h2>Stream workspace</h2>
              <p>Открывает отдельный workspace для запуска команд и live websocket stream.</p>
            </div>
            <button class="button" @click="openWorkspace">Open stream workspace</button>
          </div>
        </section>
        <RunningCommands :team-id="selectedTeamId" :project-id="selectedProjectId" :search-query="searchQuery" :projects="projects" @watch="openRunning" />
      </div>
      <SessionHistory
        v-else-if="currentSection === 'history'"
        :team-id="selectedTeamId"
        :project-id="selectedProjectId"
        :search-query="searchQuery"
        :projects="projects"
      />
      <CrudPanel v-else-if="currentSection === 'teams'" v-bind="crudConfigs.teams" />
      <CrudPanel
        v-else-if="currentSection === 'projects'"
        v-bind="crudConfigs.projects"
        :team-id="selectedTeamId"
        :project-id="selectedProjectId"
        :search-query="searchQuery"
        :projects="projects"
      />
      <CrudPanel
        v-else-if="currentSection === 'users'"
        v-bind="crudConfigs.users"
        :team-id="selectedTeamId"
        :project-id="selectedProjectId"
        :search-query="searchQuery"
        :projects="projects"
      />
      <AuthSessionsPanel
        v-else-if="currentSection === 'auth-sessions'"
        :team-id="selectedTeamId"
        :project-id="selectedProjectId"
        :search-query="searchQuery"
        :projects="projects"
      />
      <AuditPanel
        v-else-if="currentSection === 'audit'"
        :team-id="selectedTeamId"
        :project-id="selectedProjectId"
        :search-query="searchQuery"
        :projects="projects"
      />
    </div>
  </AppShell>
</template>
