<script setup>
import { computed, onMounted, ref } from 'vue'
import { authStore } from '../stores/auth'
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
const revoking = ref('')

const currentSessionUid = computed(() => authStore.state.session?.session_uid || '')
const filteredItems = computed(() => items.value.filter((item) => matchesScope({
  team_id: item.user?.team_id,
  project_id: null,
}, {
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
    const payload = await apiRequest('/api/v1/auth/sessions')
    items.value = payload.sessions || []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function revoke(item) {
  if (!window.confirm('Revoke this auth session?')) {
    return
  }
  revoking.value = item.session_uid
  try {
    await apiRequest(`/api/v1/auth/sessions/${item.session_uid}/revoke`, { method: 'POST' })
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    revoking.value = ''
  }
}

onMounted(load)
</script>

<template>
  <section class="panel">
    <div class="panel__header">
      <div>
        <h2>Auth sessions</h2>
        <p>Список выданных login sessions. Superadmin может принудительно отзывать любые сессии.</p>
      </div>
      <button class="button button--ghost" @click="load">Refresh</button>
    </div>

    <div v-if="error" class="notice notice--error">{{ error }}</div>
    <div v-else-if="loading" class="notice">Loading auth sessions...</div>
    <div v-else-if="filteredItems.length === 0" class="notice">No auth sessions match the current filter.</div>
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Team</th>
            <th>Created</th>
            <th>Expires</th>
            <th>Last used</th>
            <th>Source</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredItems" :key="item.session_uid">
            <td>{{ item.user?.email || item.user_id }}</td>
            <td>{{ item.user?.team_name || 'all' }}</td>
            <td>{{ formatStamp(item.created_at) }}</td>
            <td>{{ formatStamp(item.expires_at) }}</td>
            <td>{{ formatStamp(item.last_used_at) }}</td>
            <td>{{ item.ip_address || 'n/a' }}</td>
            <td>
              <span v-if="item.revoked_at">revoked</span>
              <span v-else-if="currentSessionUid === item.session_uid">current</span>
              <span v-else>active</span>
            </td>
            <td>
              <button
                class="button button--tiny button--danger"
                :disabled="Boolean(item.revoked_at) || revoking === item.session_uid"
                @click="revoke(item)"
              >
                {{ revoking === item.session_uid ? 'Revoking...' : 'Revoke' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
