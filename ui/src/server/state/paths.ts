import os from 'node:os'
import path from 'node:path'

/**
 * User-level config dir: ~/.config/ai-customizer/
 * Holds runtime state that doesn't belong in the catalog repo (tracker,
 * history, projects list, user preferences, lock file, backups).
 */
export function userConfigDir(): string {
  const override = process.env.AIC_USER_CONFIG_DIR
  if (override && override.length > 0) return path.resolve(override)
  return path.join(os.homedir(), '.config', 'ai-customizer')
}

export function userConfigPaths() {
  const root = userConfigDir()
  return {
    root,
    config: path.join(root, 'config.json'),
    projects: path.join(root, 'projects.json'),
    installState: path.join(root, 'install-state.json'),
    history: path.join(root, 'history.json'),
    hookRegistry: path.join(root, 'hook-registry.json'),
    backups: path.join(root, 'backups'),
    lock: path.join(root, '.lock'),
  }
}
