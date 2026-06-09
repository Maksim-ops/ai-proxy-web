<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { apiRequest } from '../lib/api'
import { hasActiveScope, matchesScope, matchesTextSearch, toId } from '../lib/scope'

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  endpoint: { type: String, required: true },
  fields: { type: Array, required: true },
  itemLabel: { type: String, required: true },
  sources: { type: Array, default: () => [] },
  teamId: { type: [String, Number], default: '' },
  projectId: { type: [String, Number], default: '' },
  searchQuery: { type: String, default: '' },
  projects: { type: Array, default: () => [] },
  scopeItemKind: { type: String, default: 'default' },
  hideUntilScoped: { type: Boolean, default: false },
  emptyScopedMessage: { type: String, default: 'Select a team or project to show items.' },
  statusEndpoint: { type: String, default: '' },
  statusKey: { type: String, default: 'name' },
  showStatusColumn: { type: Boolean, default: false },
  statusColumnLabel: { type: String, default: 'Status' },
  allowStatusToggle: { type: Boolean, default: false },
  sortMode: { type: String, default: '' },
})

const items = ref([])
const loading = ref(true)
const error = ref('')
const saving = ref(false)
const editingId = ref(null)
const form = ref({})
const optionSets = ref({})
const modalOpen = ref(false)
const statusItems = ref([])
const statusLoaded = ref(false)
const statusOverrides = ref({})

const columns = computed(() => props.fields.filter((field) => field.list !== false))
const formFields = computed(() => props.fields.filter((field) => field.form !== false))
const hasScopeSelection = computed(() => hasActiveScope(props.teamId, props.projectId))
const projectSelfFilter = computed(() => (props.scopeItemKind === 'project' ? 'id' : null))
const statusMap = computed(() => new Map(statusItems.value.map((item) => [item.server, item])))

function sortItems(items) {
  if (props.sortMode !== 'kubeMasterFirst') {
    return items
  }
  return [...items].sort((left, right) => {
    const leftRank = left.type === 'kube-master' ? 0 : 1
    const rightRank = right.type === 'kube-master' ? 0 : 1
    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }
    return String(left.name || '').localeCompare(String(right.name || ''))
  })
}

const filteredItems = computed(() => {
  if (props.hideUntilScoped && !hasScopeSelection.value) {
    return []
  }

  const scoped = items.value.filter((item) => matchesScope(item, {
    teamId: props.teamId,
    projectId: props.projectId,
    projects: props.projects,
    selfIdField: projectSelfFilter.value,
  }))
  const searched = scoped.filter((item) => matchesTextSearch(item, props.searchQuery))
  return sortItems(searched)
})

const emptyStateText = computed(() => {
  if (props.hideUntilScoped && !hasScopeSelection.value) {
    return props.emptyScopedMessage
  }
  return `No ${props.itemLabel}s match the current filter.`
})

function emptyForm() {
  const data = {}
  for (const field of formFields.value) {
    if (field.type === 'checkbox') {
      data[field.name] = field.default ?? false
      continue
    }
    if (field.type === 'select') {
      data[field.name] = field.default === undefined || field.default === null ? '' : String(field.default)
      continue
    }
    data[field.name] = field.default ?? ''
  }
  return data
}

function resetForm() {
  form.value = emptyForm()
  editingId.value = null
}

function closeModal() {
  modalOpen.value = false
  resetForm()
}

function openCreate() {
  resetForm()
  modalOpen.value = true
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const payload = await apiRequest(props.endpoint)
    items.value = Array.isArray(payload) ? payload : payload.items || []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function loadSources() {
  if (!props.sources.length) {
    optionSets.value = {}
    return
  }

  const nextOptions = {}
  try {
    await Promise.all(
      props.sources.map(async (source) => {
        const payload = await apiRequest(source.endpoint)
        nextOptions[source.name] = Array.isArray(payload) ? payload : payload.items || []
      }),
    )
    optionSets.value = nextOptions
  } catch (err) {
    error.value = err.message
  }
}

async function loadStatus() {
  if (!props.statusEndpoint) {
    statusItems.value = []
    statusLoaded.value = true
    return
  }

  try {
    const payload = await apiRequest(props.statusEndpoint)
    statusItems.value = payload.connections || []
    statusLoaded.value = true
  } catch (err) {
    statusLoaded.value = false
    error.value = err.message
  }
}

async function reloadAll() {
  await Promise.all([loadSources(), load(), loadStatus()])
}

function normalizeFormValue(field, value) {
  if (field.type === 'checkbox') {
    return Boolean(value)
  }
  if (field.type === 'select') {
    return value === null || value === undefined || value === '' ? '' : String(value)
  }
  return value ?? ''
}

function startEdit(item) {
  editingId.value = item.id
  form.value = emptyForm()
  for (const field of formFields.value) {
    if (field.name in item) {
      form.value[field.name] = normalizeFormValue(field, item[field.name])
    }
  }
  modalOpen.value = true
}

function sanitizePayload() {
  const payload = {}
  for (const field of formFields.value) {
    const value = form.value[field.name]
    if (field.type === 'checkbox') {
      payload[field.name] = Boolean(value)
      continue
    }
    if (value === '' || value === null || value === undefined) {
      if (field.sendNullOnEmpty) {
        payload[field.name] = null
        continue
      }
      if (field.optional) {
        continue
      }
      payload[field.name] = ''
      continue
    }
    if (field.type === 'number' || field.valueType === 'number') {
      payload[field.name] = Number(value)
      continue
    }
    payload[field.name] = value
  }
  return payload
}

function getOptions(field) {
  let options = field.optionsSource ? optionSets.value[field.optionsSource] || [] : field.options || []
  if (field.optionsSource === 'projects' && toId(form.value.team_id) !== null) {
    options = options.filter((item) => toId(item.team_id) === toId(form.value.team_id))
  }
  return options
}

function getOptionValue(field, option) {
  if (option && typeof option === 'object') {
    if (field.optionValue && option[field.optionValue] !== undefined) {
      return option[field.optionValue]
    }
    if (option.id !== undefined) {
      return option.id
    }
    if (option.value !== undefined) {
      return option.value
    }
  }
  return option
}

function getOptionLabel(field, option) {
  if (option && typeof option === 'object') {
    if (field.optionLabel && option[field.optionLabel] !== undefined) {
      return option[field.optionLabel]
    }
    if (option.label !== undefined) {
      return option.label
    }
    if (option.name !== undefined) {
      return option.name
    }
    if (option.username !== undefined) {
      return option.username
    }
    if (option.proxy !== undefined) {
      return option.proxy
    }
  }
  return String(option)
}

function formatCell(item, column) {
  const value = item[column.name]
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no'
  }
  if (value === null || value === undefined || value === '') {
    return '—'
  }
  return value
}

function getStatusName(item) {
  return item[props.statusKey] ?? item.name
}

function isConnected(item) {
  const statusKey = getStatusName(item)
  if (Object.prototype.hasOwnProperty.call(statusOverrides.value, statusKey)) {
    return Boolean(statusOverrides.value[statusKey])
  }
  const status = statusMap.value.get(statusKey)
  return Boolean(status && status.connected)
}

function toggleConnection(item) {
  const statusKey = getStatusName(item)
  statusOverrides.value = {
    ...statusOverrides.value,
    [statusKey]: !isConnected(item),
  }
}

function getRowClass(item) {
  if (props.sortMode === 'kubeMasterFirst' && item.type === 'kube-master') {
    return 'crud-row--master'
  }
  if (item.enabled === false) {
    return 'crud-row--neutral'
  }
  if (!props.statusEndpoint || !statusLoaded.value) {
    return ''
  }

  if (isConnected(item)) {
    return 'crud-row--neutral'
  }
  return 'crud-row--danger'
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    const payload = sanitizePayload()
    if (editingId.value) {
      await apiRequest(`${props.endpoint}/${editingId.value}`, { method: 'PATCH', body: payload })
    } else {
      await apiRequest(props.endpoint, { method: 'POST', body: payload })
    }
    closeModal()
    await reloadAll()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function remove(id) {
  if (!window.confirm(`Delete this ${props.itemLabel}?`)) {
    return
  }
  try {
    await apiRequest(`${props.endpoint}/${id}`, { method: 'DELETE' })
    await reloadAll()
    if (editingId.value === id) {
      closeModal()
    }
  } catch (err) {
    error.value = err.message
  }
}

watch(
  () => form.value.team_id,
  (value) => {
    if (toId(value) === null || toId(form.value.project_id) === null) {
      return
    }
    const selectedProject = (optionSets.value.projects || []).find((item) => toId(item.id) === toId(form.value.project_id))
    if (selectedProject && toId(selectedProject.team_id) !== toId(value)) {
      form.value.project_id = ''
    }
  },
)

watch(
  () => form.value.project_id,
  (value) => {
    if (toId(value) === null) {
      return
    }
    const selectedProject = (optionSets.value.projects || []).find((item) => toId(item.id) === toId(value))
    if (selectedProject) {
      form.value.team_id = String(selectedProject.team_id)
    }
  },
)

onMounted(async () => {
  resetForm()
  await reloadAll()
})
</script>

<template>
  <section class="panel panel--crud">
    <div class="panel__header">
      <div>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
      <button class="button button--ghost" @click="openCreate">New {{ itemLabel }}</button>
    </div>

    <div v-if="error" class="notice notice--error">{{ error }}</div>

    <div class="crud-table crud-table--full">
      <div v-if="loading" class="notice">Loading {{ itemLabel }} list...</div>
      <div v-else-if="filteredItems.length === 0" class="notice">{{ emptyStateText }}</div>
      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th v-for="column in columns" :key="column.name">{{ column.label }}</th>
              <th v-if="showStatusColumn">{{ statusColumnLabel }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredItems" :key="item.id" :class="getRowClass(item)">
              <td v-for="column in columns" :key="column.name">{{ formatCell(item, column) }}</td>
              <td v-if="showStatusColumn" class="ssh-status-cell">
                <span
                  class="ssh-indicator"
                  :class="isConnected(item) ? 'ssh-indicator--connected' : 'ssh-indicator--disconnected'"
                  :title="isConnected(item) ? 'SSH connected' : 'SSH disconnected'"
                />
              </td>
              <td class="table-actions">
                <button
                  v-if="allowStatusToggle"
                  class="button button--tiny button--ghost"
                  @click="toggleConnection(item)"
                >
                  {{ isConnected(item) ? 'Disconnect' : 'Connect' }}
                </button>
                <button class="button button--tiny" @click="startEdit(item)">Edit</button>
                <button class="button button--tiny button--danger" @click="remove(item.id)">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="modalOpen" class="modal-backdrop" @click.self="closeModal">
      <div class="modal-card">
        <div class="modal-card__header">
          <div>
            <h3>{{ editingId ? `Edit ${itemLabel}` : `Create ${itemLabel}` }}</h3>
            <p>{{ editingId ? 'Update the selected record in place.' : 'Fill the fields below to create a new record.' }}</p>
          </div>
          <button class="button button--ghost button--tiny" @click="closeModal">Close</button>
        </div>

        <div v-if="error" class="notice notice--error">{{ error }}</div>

        <div class="modal-card__form">
          <label v-for="field in formFields" :key="field.name">
            <span>{{ field.label }}</span>
            <textarea
              v-if="field.type === 'textarea'"
              v-model="form[field.name]"
              class="input input--textarea"
              :placeholder="field.placeholder || ''"
            />
            <select
              v-else-if="field.type === 'select'"
              v-model="form[field.name]"
              class="input"
            >
              <option value="">{{ field.placeholder || `Select ${field.label}` }}</option>
              <option
                v-for="option in getOptions(field)"
                :key="`${field.name}-${getOptionValue(field, option)}`"
                :value="String(getOptionValue(field, option))"
              >
                {{ getOptionLabel(field, option) }}
              </option>
            </select>
            <input
              v-else-if="field.type !== 'checkbox'"
              v-model="form[field.name]"
              class="input"
              :type="field.type || 'text'"
              :placeholder="field.placeholder || ''"
            />
            <label v-else class="checkbox-row">
              <input v-model="form[field.name]" type="checkbox" />
              <span>{{ field.checkboxLabel || field.label }}</span>
            </label>
          </label>
        </div>

        <div class="button-row">
          <button class="button" :disabled="saving" @click="save">{{ saving ? 'Saving...' : editingId ? 'Save changes' : `Create ${itemLabel}` }}</button>
          <button class="button button--ghost" @click="closeModal">Cancel</button>
        </div>
      </div>
    </div>
  </section>
</template>
