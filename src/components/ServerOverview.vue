<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { apiRequest } from '../lib/api'
import { matchesScope, matchesTextSearch } from '../lib/scope'

const props = defineProps({
  compact: { type: Boolean, default: false },
  teamId: { type: [String, Number], default: '' },
  projectId: { type: [String, Number], default: '' },
  searchQuery: { type: String, default: '' },
  projects: { type: Array, default: () => [] },
})

const servers = ref([])
const sshConnections = ref([])
const running = ref([])
const loading = ref(true)
const error = ref('')
let timer = null

const cards = computed(() => {
  const sshMap = new Map(sshConnections.value.map((item) => [item.server, item]))
  return servers.value
    .map((server) => {
      const ssh = sshMap.get(server.name) || {}
      const runningCount = running.value.filter((item) => item.server === server.name).length
      return {
        ...server,
        connected: Boolean(ssh.connected),
        activeCommands: ssh.active_commands ?? 0,
        idleIn: ssh.idle_disconnect_in_seconds,
        runningCount,
      }
    })
    .filter((item) => matchesScope(item, {
      teamId: props.teamId,
      projectId: props.projectId,
      projects: props.projects,
    }) && matchesTextSearch(item, props.searchQuery))
})

function cardClass(item) {
  if (item.enabled === false || item.connected) {
    return 'server-card--neutral'
  }
  return 'server-card--danger'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [serversData, sshData, runningData] = await Promise.all([
      apiRequest('/api/v1/servers'),
      apiRequest('/api/v1/ssh/status').catch(() => ({ connections: [] })),
      apiRequest('/api/v1/running').catch(() => ({ running: [] })),
    ])

    servers.value = Array.isArray(serversData) ? serversData : serversData.servers || []
    sshConnections.value = sshData.connections || []
    running.value = runningData.running || []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  timer = window.setInterval(load, 8000)
})

onUnmounted(() => {
  if (timer) {
    window.clearInterval(timer)
  }
})
</script>

<template>
  <section class="panel">
    <div class="panel__header">
      <div>
        <h2>Server status</h2>
        <p>Enabled servers, SSH reuse state and running command counters.</p>
      </div>
      <button class="button button--ghost" @click="load">Refresh</button>
    </div>

    <div v-if="error" class="notice notice--error">{{ error }}</div>
    <div v-else-if="loading" class="notice">Loading server state...</div>
    <div v-else-if="cards.length === 0" class="notice">No servers match the current filter.</div>
    <div v-else class="server-grid" :class="{ 'server-grid--compact': compact }">
      <article v-for="item in cards" :key="item.id" class="server-card" :class="cardClass(item)">
        <header class="server-card__header">
          <div>
            <span class="server-card__eyebrow">{{ item.environment }}</span>
            <h3>{{ item.name }}</h3>
          </div>
          <span class="badge" :class="item.connected ? 'badge--muted' : 'badge--danger'">
            {{ item.connected ? 'ssh connected' : 'ssh missing' }}
          </span>
        </header>
        <dl class="metric-list">
          <div>
            <dt>Host</dt>
            <dd>{{ item.host }}</dd>
          </div>
          <div>
            <dt>Project</dt>
            <dd>{{ item.project_name || 'n/a' }}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{{ item.type || 'n/a' }}</dd>
          </div>
          <div>
            <dt>Running now</dt>
            <dd>{{ item.runningCount }}</dd>
          </div>
          <div>
            <dt>SSH active</dt>
            <dd>{{ item.activeCommands }}</dd>
          </div>
          <div>
            <dt>Enabled</dt>
            <dd>{{ item.enabled ? 'yes' : 'no' }}</dd>
          </div>
        </dl>
      </article>
    </div>
  </section>
</template>
