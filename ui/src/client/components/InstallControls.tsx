import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  InstallableType,
  InstallationEntry,
  ProjectEntry,
  TargetScope,
  Tool,
} from '../../shared/schemas'
import { api, ApiClientError } from '../api/client'
import { useProjects } from '../hooks/useAppState'
import { useInstallations } from '../hooks/useInstall'

interface InstallControlsProps {
  customId: string
  customType: 'skill' | 'agent' | 'patch'
  supportedTools: Tool[]
}

export function InstallControls({ customId, customType, supportedTools }: InstallControlsProps) {
  if (customType === 'patch') {
    return (
      <section className="panel">
        <h2>Install</h2>
        <p className="muted">
          Patches are managed from the Application Guide (coming in M6).
        </p>
      </section>
    )
  }

  return (
    <SkillAgentInstallControls
      customId={customId}
      customType={customType}
      supportedTools={supportedTools}
    />
  )
}

function SkillAgentInstallControls({
  customId,
  customType,
  supportedTools,
}: {
  customId: string
  customType: InstallableType
  supportedTools: Tool[]
}) {
  const installations = useInstallations()
  const projects = useProjects()

  const existing = useMemo<InstallationEntry | null>(() => {
    if (installations.state.status !== 'success') return null
    return (
      installations.state.data.installations.find(
        (e) => e.customType === customType && e.customId === customId,
      ) ?? null
    )
  }, [installations.state, customType, customId])

  const [active, setActive] = useState(false)
  const [target, setTarget] = useState<TargetScope>({ scope: 'global' })
  const [tools, setTools] = useState<Tool[]>(supportedTools)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (installations.state.status !== 'success') return
    if (existing) {
      setActive(true)
      setTarget(existing.target)
      setTools(existing.tools)
    } else {
      setActive(false)
      setTarget({ scope: 'global' })
      setTools(supportedTools)
    }
  }, [existing, installations.state.status, supportedTools])

  const handleSave = async () => {
    setSaving(true)
    setErr(null)
    try {
      if (!active) {
        await api.removeInstallation(customType, customId).catch((e: unknown) => {
          if (e instanceof ApiClientError && e.status === 404) return
          throw e
        })
      } else {
        if (tools.length === 0) {
          setErr('Pick at least one tool')
          setSaving(false)
          return
        }
        await api.upsertInstallation({ customId, customType, target, tools })
      }
      installations.refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const projectList: ProjectEntry[] =
    projects.state.status === 'success' ? projects.state.data.projects : []

  const toolSet = new Set(tools)

  return (
    <section className="panel">
      <h2>Install</h2>

      <label className="install-active">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{' '}
        Active (included in next Apply)
      </label>

      <fieldset className="install-group" disabled={!active}>
        <legend>Target</legend>
        <label>
          <input
            type="radio"
            checked={target.scope === 'global'}
            onChange={() => setTarget({ scope: 'global' })}
          />{' '}
          Global
        </label>
        <label>
          <input
            type="radio"
            checked={target.scope === 'project'}
            onChange={() => {
              const first = projectList[0]
              if (first) setTarget({ scope: 'project', projectId: first.id })
            }}
            disabled={projectList.length === 0}
          />{' '}
          Project
          {target.scope === 'project' ? (
            <select
              value={(target as { projectId: string }).projectId}
              onChange={(e) => setTarget({ scope: 'project', projectId: e.target.value })}
            >
              {projectList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.path})
                </option>
              ))}
            </select>
          ) : null}
        </label>
        {projectList.length === 0 ? (
          <p className="muted small">
            Project targets require known projects — add them in <Link to="/settings">Settings</Link>.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="install-group" disabled={!active}>
        <legend>Tools</legend>
        {supportedTools.map((t) => (
          <label key={t}>
            <input
              type="checkbox"
              checked={toolSet.has(t)}
              onChange={(e) => {
                const next = new Set(toolSet)
                if (e.target.checked) next.add(t)
                else next.delete(t)
                setTools(Array.from(next) as Tool[])
              }}
            />{' '}
            {t}
          </label>
        ))}
      </fieldset>

      {err ? <p className="error">{err}</p> : null}

      <div className="row">
        <button className="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link to="/apply" className="button button-secondary">
          Review Apply plan →
        </Link>
      </div>

      <p className="muted small">
        Saving stages the change. Run Apply to sync to your filesystem.
      </p>
    </section>
  )
}
