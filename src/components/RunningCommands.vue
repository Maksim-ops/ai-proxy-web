<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { apiRequest } from '../lib/api'
import { hasActiveScope, matchesScope, matchesTextSearch } from '../lib/scope'

const props = defineProps({
  teamId: { type: [String, Number], default: '' },
  projectId: { type: [String, Number], default: '' },
  searchQuery: { type: String, default: '' },
  projects: { type: Array, default: () => [] },
})

const emit = defineEmits(['watch'])

const loading = ref(true)
const error = ref('')
const items = ref([])
let timer = null

const filteredItems = computed(() => items.value.filter((item) => matchesScope(item, {
  teamId: props.teamId,
  projectId: props.projectId,
  projects: props.projects,
}) && matchesTextSearch(item, props.searchQuery)))

const emptyText = computed(() => (
  hasActiveScope(props.teamId, props.projectId) || props.searchQuery
    ? 'No active command streams for the current filter.'
    : 'No active command streams.'
))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const payload = await apiRequest('/api/v1/running')
    items.value = payload.running || []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  timer = window.setInterval(load, 4000)
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
        <h2>Running commands</h2>
        <p>Live list of active command streams. Open any stream in the terminal view.</p>
      </div>
      <button class="button button--ghost" @click="load">Refresh</button>
    </div>

    <div v-if="error" class="notice notice--error">{{ error }}</div>
    <div v-else-if="loading" class="notice">Loading running commands...</div>
    <div v-else-if="filteredItems.length === 0" class="notice">{{ emptyText }}</div>
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Request</th>
            <th>Server</th>
            <th>Team</th>
            <th>Project</th>
            <th>Stream</th>
            <th>Command</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredItems" :key="item.request_id">
            <td>{{ item.request_id }}</td>
            <td>{{ item.server }}</td>
            <td>{{ item.team_name || '—' }}</td>
            <td>{{ item.project_name || '—' }}</td>
            <td>#{{ item.stream_id }}</td>
            <td><code>{{ (item.argv || []).join(' ') }}</code></td>
            <td>
              <button class="button button--tiny" @click="emit('watch', item)">Watch</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
