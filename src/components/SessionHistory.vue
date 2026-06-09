<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { apiRequest } from '../lib/api'
import { matchesScope, matchesTextSearch } from '../lib/scope'

const props = defineProps({
  limit: { type: Number, default: 120 },
  teamId: { type: [String, Number], default: '' },
  projectId: { type: [String, Number], default: '' },
  searchQuery: { type: String, default: '' },
  projects: { type: Array, default: () => [] },
})

const loading = ref(true)
const error = ref('')
const sessions = ref([])
const selectedRequestId = ref('')
const detail = ref(null)
const detailLoading = ref(false)
const deletingRequestId = ref('')

const filteredSessions = computed(() => sessions.value.filter((item) => matchesScope(item, {
  teamId: props.teamId,
  projectId: props.projectId,
  projects: props.projects,
}) && matchesTextSearch(item, props.searchQuery)))

function pad(value) {
  return String(value).padStart(2, '0')
}

function toDateParts(value) {
  const date = value instanceof Date ? value : new Date(value)
  return {
    year: pad(date.getFullYear() % 100),
    month: pad(date.getMonth() + 1),
    day: pad(date.getDate()),
    hours: pad(date.getHours()),
    minutes: pad(date.getMinutes()),
    seconds: pad(date.getSeconds()),
  }
}

function formatStamp(value) {
  if (!value) {
    return 'n/a'
  }
  const parts = toDateParts(value)
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hours}:${parts.minutes}:${parts.seconds}`
}

function formatTime(value) {
  if (!value) {
    return 'n/a'
  }
  const parts = toDateParts(value)
  return `${parts.hours}:${parts.minutes}:${parts.seconds}`
}

function formatRange(startedAt, finishedAt) {
  if (!startedAt && !finishedAt) {
    return 'n/a'
  }
  if (!startedAt) {
    return formatStamp(finishedAt)
  }
  if (!finishedAt) {
    return formatStamp(startedAt)
  }

  const start = new Date(startedAt)
  const finish = new Date(finishedAt)
  const sameDate = start.getFullYear() === finish.getFullYear()
    && start.getMonth() === finish.getMonth()
    && start.getDate() === finish.getDate()

  return sameDate
    ? `${formatStamp(start)} - ${formatTime(finish)}`
    : `${formatStamp(start)} - ${formatStamp(finish)}`
}

function ensureSelectedVisible() {
  if (!filteredSessions.value.some((item) => item.request_id === selectedRequestId.value)) {
    selectedRequestId.value = filteredSessions.value[0]?.request_id || ''
  }
  if (!selectedRequestId.value) {
    detail.value = null
  }
}

async function loadSessions() {
  loading.value = true
  error.value = ''
  try {
    const payload = await apiRequest(`/api/v1/sessions?limit=${props.limit}`)
    sessions.value = payload.sessions || []
    ensureSelectedVisible()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function loadDetail(requestId) {
  if (!requestId) {
    detail.value = null
    return
  }
  detailLoading.value = true
  try {
    const payload = await apiRequest(`/api/v1/sessions/${requestId}`)
    detail.value = payload.session
  } catch (err) {
    error.value = err.message
    detail.value = null
  } finally {
    detailLoading.value = false
  }
}

async function removeSession(item) {
  if (!window.confirm('Remove this session from History?')) {
    return
  }
  deletingRequestId.value = item.request_id
  try {
    await apiRequest(`/api/v1/sessions/${item.request_id}`, { method: 'DELETE' })
    sessions.value = sessions.value.filter((entry) => entry.request_id !== item.request_id)
    ensureSelectedVisible()
  } catch (err) {
    error.value = err.message
  } finally {
    deletingRequestId.value = ''
  }
}

watch(selectedRequestId, (value) => {
  loadDetail(value)
})

watch(filteredSessions, () => {
  ensureSelectedVisible()
}, { deep: true })

onMounted(() => {
  loadSessions()
})
</script>

<template>
  <section class="panel panel--history">
    <div class="panel__header">
      <div>
        <h2>Session history</h2>
        <p>Слева список сессий, справа описание запуска и сохранённые stdout/stderr логи.</p>
      </div>
      <button class="button button--ghost" @click="loadSessions">Refresh</button>
    </div>

    <div v-if="error" class="notice notice--error">{{ error }}</div>

    <div class="history-layout">
      <div class="history-list">
        <div v-if="loading" class="notice">Loading sessions...</div>
        <div v-else-if="filteredSessions.length === 0" class="notice">No sessions match the current filter.</div>
        <article
          v-for="item in filteredSessions"
          :key="item.request_id"
          class="history-item"
          :class="{ 'history-item--active': selectedRequestId === item.request_id }"
        >
          <div class="history-item__top">
            <button class="history-item__title" @click="selectedRequestId = item.request_id">
              <strong>{{ item.server_name }}</strong>
            </button>
            <button
              class="history-item__delete"
              :disabled="deletingRequestId === item.request_id"
              title="Удалить сессию"
              aria-label="Удалить сессию"
              @click="removeSession(item)"
            >
              {{ deletingRequestId === item.request_id ? '…' : '×' }}
            </button>
          </div>
          <button class="history-item__body" @click="selectedRequestId = item.request_id">
            <code>{{ item.command }}</code>
            <small>{{ item.team_name || '—' }} · {{ item.project_name || '—' }}</small>
            <small>{{ formatRange(item.started_at, item.finished_at) }}</small>
          </button>
        </article>
      </div>

      <div class="history-detail panel panel--nested">
        <div v-if="detailLoading" class="notice">Loading selected session...</div>
        <template v-else-if="detail">
          <div class="history-detail__header">
            <div>
              <h3>{{ detail.server_name }} · {{ detail.status }}</h3>
              <p>{{ detail.command }}</p>
            </div>
          </div>

          <div class="history-detail__metrics">
            <span>Request: {{ detail.request_id }}</span>
            <span>Scope: {{ detail.team_name || '—' }} / {{ detail.project_name || '—' }}</span>
            <span>{{ formatRange(detail.started_at, detail.finished_at) }}</span>
            <span>Exit: {{ detail.exit_code ?? 'n/a' }}</span>
          </div>

          <div class="history-scroll">
            <div class="history-scroll__section">
              <div class="history-scroll__label">stdout</div>
              <pre>{{ detail.stdout || '' }}</pre>
            </div>
            <div class="history-scroll__section history-scroll__section--stderr">
              <div class="history-scroll__label">stderr</div>
              <pre>{{ detail.stderr || '' }}</pre>
            </div>
          </div>
        </template>
        <div v-else class="notice">Choose a session from the list to inspect stored logs.</div>
      </div>
    </div>
  </section>
</template>
