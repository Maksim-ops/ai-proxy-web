<script setup>
import { computed } from 'vue'
import { filterProjectsByTeam, resolveProject } from '../lib/scope'

const props = defineProps({
  teams: { type: Array, default: () => [] },
  projects: { type: Array, default: () => [] },
  teamId: { type: [String, Number], default: '' },
  projectId: { type: [String, Number], default: '' },
  searchQuery: { type: String, default: '' },
  title: { type: String, default: 'Filters' },
  description: { type: String, default: 'Filter the current page by team and project.' },
})

const emit = defineEmits(['update:teamId', 'update:projectId', 'update:searchQuery'])

const visibleProjects = computed(() => filterProjectsByTeam(props.projects, props.teamId))

function updateTeam(value) {
  emit('update:teamId', value)
  if (value && props.projectId) {
    const project = resolveProject(props.projects, props.projectId)
    if (project && String(project.team_id) !== String(value)) {
      emit('update:projectId', '')
    }
  }
}

function updateProject(value) {
  emit('update:projectId', value)
  if (!value) {
    return
  }
  const project = resolveProject(props.projects, value)
  if (project) {
    emit('update:teamId', String(project.team_id))
  }
}

function clearFilters() {
  emit('update:teamId', '')
  emit('update:projectId', '')
  emit('update:searchQuery', '')
}
</script>

<template>
  <section class="panel panel--scope">
    <div class="panel__header panel__header--tight">
      <div>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
    </div>

    <div class="scope-filter-bar">
      <label>
        <span>Team</span>
        <select class="input" :value="String(teamId || '')" @change="updateTeam($event.target.value)">
          <option value="">All teams</option>
          <option v-for="item in teams" :key="item.id" :value="String(item.id)">{{ item.name }}</option>
        </select>
      </label>

      <label>
        <span>Project</span>
        <select class="input" :value="String(projectId || '')" @change="updateProject($event.target.value)">
          <option value="">All projects</option>
          <option v-for="item in visibleProjects" :key="item.id" :value="String(item.id)">{{ item.name }}</option>
        </select>
      </label>

      <label>
        <span>Search</span>
        <input
          class="input"
          :value="searchQuery"
          type="text"
          placeholder="Filter visible rows by any value"
          @input="emit('update:searchQuery', $event.target.value)"
        />
      </label>

      <div class="scope-filter-bar__actions">
        <button class="button button--ghost button--wide" @click="clearFilters">Clear filters</button>
      </div>
    </div>
  </section>
</template>
