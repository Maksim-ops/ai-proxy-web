<script setup>
import { computed, onMounted, ref } from 'vue'
import { apiRequest } from '../lib/api'
import { matchesScope, matchesTextSearch } from '../lib/scope'

const props = defineProps({
  teamId: { type: [String, Number], default: '' },
  projectId: { type: [String, Number], default: '' },
  searchQuery: { type: String, default: '' },
  projects: { type: Array, default: () => [] },
})

const items = ref([])
const loading = ref(true)
const error = ref('')

const filteredItems = computed(() => items.value.filter((item) => matchesScope(item, {
  teamId: props.teamId,
  projectId: props.projectId,
  projects: props.projects,
}) && matchesTextSearch(item, props.searchQuery)))

function formatStamp(value) {
  if (!value) {
    return 'n/a'
  }
  return new Date(value).toLocaleString()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const payload = await apiRequest('/api/v1/audit?limit=200')
    items.value = payload.audit || []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="panel">
    <div class="panel__header">
      <div>
        <h2>Audit log</h2>
        <p>Auth, revoke, exec и подозрительные попытки собираются в единый аудит.</p>
      </div>
      <button class="button button--ghost" @click="load">Refresh</button>
    </div>

    <div v-if="error" class="notice notice--error">{{ error }}</div>
    <div v-else-if="loading" class="notice">Loading audit log...</div>
    <div v-else-if="filteredItems.length === 0" class="notice">No audit events match the current filter.</div>
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            <th>Team</th>
            <th>Project</th>
            <th>Resource</th>
            <th>Result</th>
            <th>IP</th>
            <th>Request</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredItems" :key="item.id">
            <td>{{ formatStamp(item.created_at) }}</td>
            <td>{{ item.action || 'n/a' }}</td>
            <td>{{ item.team_name || '—' }}</td>
            <td>{{ item.project_name || '—' }}</td>
            <td>{{ item.resource }}</td>
            <td>{{ item.result }}</td>
            <td>{{ item.ip_address || 'n/a' }}</td>
            <td>{{ item.request_id || 'n/a' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
