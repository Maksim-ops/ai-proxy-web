<script setup>
import { computed, ref, watch } from 'vue'
import { apiRequest } from '../lib/api'
import { shellSplit } from '../lib/shell'

const props = defineProps({
  servers: { type: Array, default: () => [] },
  title: { type: String, default: 'Command runner' },
  description: { type: String, default: 'Submit commands the same way the CLI does, then choose whether to stay here or open the terminal stream.' },
  autoOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['started', 'queued'])

const command = ref('date')
const server = ref('')
const feedback = ref('')
const feedbackKind = ref('info')
const running = ref(false)
const checking = ref(false)

const availableServers = computed(() => props.servers.filter((item) => item.enabled))
const runLabel = computed(() => (props.autoOpen ? 'Run command' : 'Open in stream'))

watch(
  availableServers,
  (items) => {
    if (!items.some((item) => item.name === server.value)) {
      server.value = items[0]?.name || ''
    }
  },
  { immediate: true },
)

function setFeedback(kind, text) {
  feedbackKind.value = kind
  feedback.value = text
}

async function runCheck() {
  checking.value = true
  try {
    const argv = shellSplit(command.value)
    const payload = await apiRequest('/api/v1/can-i', {
      method: 'POST',
      body: { server: server.value, argv },
    })
    setFeedback(payload.allowed ? 'success' : 'error', payload.reason)
  } catch (error) {
    setFeedback('error', error.message)
  } finally {
    checking.value = false
  }
}

async function submit(mode = 'queue') {
  running.value = true
  try {
    const argv = shellSplit(command.value)
    const payload = await apiRequest('/api/v1/exec', {
      method: 'POST',
      body: {
        server: server.value,
        argv,
        client_type: 'WEB',
      },
    })
    setFeedback('success', `Queued request ${payload.request_id}`)
    emit('queued', payload)
    if (mode === 'open') {
      emit('started', payload)
    }
  } catch (error) {
    setFeedback('error', error.message)
  } finally {
    running.value = false
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel__header">
      <div>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
    </div>

    <div class="form-grid">
      <label>
        <span>Server</span>
        <select v-model="server" class="input">
          <option v-for="item in availableServers" :key="item.id" :value="item.name">{{ item.name }}</option>
        </select>
      </label>
      <label class="form-grid__wide">
        <span>Command</span>
        <input v-model="command" class="input" placeholder="kubectl get pods -n default" />
      </label>
    </div>

    <div class="button-row">
      <button class="button button--ghost" :disabled="checking || running || !server" @click="runCheck">
        {{ checking ? 'Checking...' : 'Policy check' }}
      </button>
      <button class="button button--ghost" :disabled="running || !server" @click="submit('queue')">
        {{ running ? 'Submitting...' : 'Queue only' }}
      </button>
      <button class="button" :disabled="running || !server" @click="submit('open')">
        {{ running ? 'Submitting...' : runLabel }}
      </button>
    </div>

    <div v-if="feedback" class="notice" :class="feedbackKind === 'error' ? 'notice--error' : feedbackKind === 'success' ? 'notice--success' : ''">
      {{ feedback }}
    </div>
  </section>
</template>
