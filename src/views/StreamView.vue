<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { authStore } from '../stores/auth'
import { apiRequest } from '../lib/api'
import { matchesScope, matchesTextSearch, resolveProject } from '../lib/scope'
import ExecPanel from '../components/ExecPanel.vue'
import RunningCommands from '../components/RunningCommands.vue'
import ScopeFilterBar from '../components/ScopeFilterBar.vue'
import StreamTerminal from '../components/StreamTerminal.vue'

const router = useRouter()
const route = useRoute()
const user = computed(() => authStore.state.user || {})
const servers = ref([])
const teams = ref([])
const projects = ref([])
const filtersLoading = ref(true)
const filtersError = ref('')
const selectedTeamId = ref(String(route.query.team_id || ''))
const selectedProjectId = ref(String(route.query.project_id || ''))
const searchQuery = ref('')
const session = ref(null)
const loading = ref(false)
const error = ref('')

const streamId = computed(() => route.query.stream_id || '')
const requestId = computed(() => route.query.request_id || '')
const server = computed(() => route.query.server || session.value?.server_name || '')
const shareToken = computed(() => route.query.share_token || session.value?.stream?.share_token || '')
const filteredServers = computed(() => servers.value.filter((item) => matchesScope(item, {
  teamId: selectedTeamId.value,
  projectId: selectedProjectId.value,
  projects: projects.value,
}) && matchesTextSearch(item, searchQuery.value)))

function buildScopeQuery(extra = {}) {
  return {
    ...route.query,
    ...extra,
    ...(selectedTeamId.value ? { team_id: selectedTeamId.value } : { team_id: undefined }),
    ...(selectedProjectId.value ? { project_id: selectedProjectId.value } : { project_id: undefined }),
  }
}

async function loadScopeData() {
  filtersLoading.value = true
  filtersError.value = ''
  try {
    const serverPayload = await apiRequest('/api/v1/servers')
    const serverItems = Array.isArray(serverPayload) ? serverPayload : serverPayload.servers || []
    servers.value = serverItems

    const teamMap = new Map()
    const projectMap = new Map()
    for (const item of serverItems) {
      if (item.team_id && item.team_name) {
        teamMap.set(item.team_id, { id: item.team_id, name: item.team_name })
      }
      if (item.project_id && item.project_name) {
        projectMap.set(item.project_id, {
          id: item.project_id,
          name: item.project_name,
          team_id: item.team_id,
        })
      }
    }

    teams.value = Array.from(teamMap.values()).sort((left, right) => left.name.localeCompare(right.name))
    projects.value = Array.from(projectMap.values()).sort((left, right) => left.name.localeCompare(right.name))
  } catch (err) {
    filtersError.value = err.message
  } finally {
    filtersLoading.value = false
  }
}

async function loadSession() {
  if (!requestId.value) {
    session.value = null
    return
  }
  loading.value = true
  error.value = ''
  try {
    const payload = await apiRequest(`/api/v1/sessions/${requestId.value}`)
    session.value = payload.session
  } catch (err) {
    error.value = err.message
    session.value = null
  } finally {
    loading.value = false
  }
}

watch(requestId, () => {
  loadSession()
}, { immediate: true })

function back() {
  router.push(authStore.isSuperadmin(user.value) ? '/admin' : '/app')
}

function updateTeamFilter(value) {
  selectedTeamId.value = value
  if (!selectedProjectId.value) {
    router.replace({ path: '/stream', query: buildScopeQuery() })
    return
  }
  const project = resolveProject(projects.value, selectedProjectId.value)
  if (project && String(project.team_id) !== String(value)) {
    selectedProjectId.value = ''
  }
  router.replace({ path: '/stream', query: buildScopeQuery() })
}

function updateProjectFilter(value) {
  selectedProjectId.value = value
  const project = resolveProject(projects.value, value)
  if (project) {
    selectedTeamId.value = String(project.team_id)
  }
  router.replace({ path: '/stream', query: buildScopeQuery() })
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

function openExecStream(payload) {
  router.push({
    path: '/stream',
    query: buildScopeQuery({
      stream_id: payload.stream_id,
      request_id: payload.request_id,
      server: payload.server,
      share_token: payload.share_token,
    }),
  })
}

onMounted(() => {
  loadScopeData()
})
</script>

<template>
  <div class="stream-page">
    <div class="stream-page__toolbar">
      <button class="button button--ghost" @click="back">Back</button>
      <div>
        <h1>Stream workspace</h1>
        <p>Queue commands, follow live websocket output и рядом держите сохранённый лог выбранной сессии.</p>
      </div>
    </div>

    <div class="stack-layout">
      <ScopeFilterBar
        v-if="!filtersLoading"
        :teams="teams"
        :projects="projects"
        :team-id="selectedTeamId"
        :project-id="selectedProjectId"
        :search-query="searchQuery"
        title="Scope"
        description="Filter available servers and running streams without leaving the terminal page."
        @update:team-id="updateTeamFilter"
        @update:project-id="updateProjectFilter"
        @update:search-query="searchQuery = $event"
      />
      <div v-if="filtersError" class="notice notice--error">{{ filtersError }}</div>

      <ExecPanel
        :servers="filteredServers"
        :auto-open="true"
        title="Run inside stream workspace"
        description="Main run button keeps you on this page and immediately switches the terminal to the new command."
        @started="openExecStream"
      />
      <RunningCommands :team-id="selectedTeamId" :project-id="selectedProjectId" :search-query="searchQuery" :projects="projects" @watch="openRunning" />
      <div v-if="error" class="notice notice--error">{{ error }}</div>
      <div v-else-if="loading" class="notice">Loading session logs...</div>
      <StreamTerminal
        :stream-id="streamId"
        :request-id="requestId"
        :server="server"
        :share-token="shareToken"
        :history-stdout="session?.stdout || ''"
        :history-stderr="session?.stderr || ''"
        title="Command terminal"
      />
    </div>
  </div>
</template>
