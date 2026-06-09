export function toId(value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function hasActiveScope(teamId, projectId) {
  return toId(teamId) !== null || toId(projectId) !== null
}

export function resolveProject(projects, projectId) {
  const normalizedProjectId = toId(projectId)
  if (normalizedProjectId === null) {
    return null
  }
  return (projects || []).find((item) => toId(item.id) === normalizedProjectId) || null
}

export function filterProjectsByTeam(projects, teamId) {
  const normalizedTeamId = toId(teamId)
  if (normalizedTeamId === null) {
    return projects || []
  }
  return (projects || []).filter((item) => toId(item.team_id) === normalizedTeamId)
}

function collectSearchFragments(value, fragments) {
  if (value === null || value === undefined) {
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSearchFragments(item, fragments)
    }
    return
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) {
      collectSearchFragments(item, fragments)
    }
    return
  }
  fragments.push(String(value))
}

export function matchesTextSearch(item, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  const fragments = []
  collectSearchFragments(item, fragments)
  return fragments.join(' ').toLowerCase().includes(normalizedQuery)
}

export function matchesScope(item, options = {}) {
  const {
    teamId,
    projectId,
    projects = [],
    teamIdField = 'team_id',
    projectIdField = 'project_id',
    selfIdField = null,
  } = options

  const normalizedTeamId = toId(teamId)
  const normalizedProjectId = toId(projectId)
  const itemTeamId = toId(item?.[teamIdField])
  const itemProjectId = toId(item?.[projectIdField])

  if (normalizedTeamId !== null && itemTeamId !== normalizedTeamId) {
    return false
  }

  if (normalizedProjectId === null) {
    return true
  }

  if (selfIdField) {
    return toId(item?.[selfIdField]) === normalizedProjectId
  }

  if (itemProjectId !== null) {
    return itemProjectId === normalizedProjectId
  }

  const project = resolveProject(projects, normalizedProjectId)
  if (!project) {
    return false
  }

  return itemTeamId === toId(project.team_id)
}
