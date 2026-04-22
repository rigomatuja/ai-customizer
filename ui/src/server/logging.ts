/**
 * Lightweight structured logging.
 *
 * - Default: human-readable lines to stderr (`[ai-customizer] …`).
 * - Set `AIC_LOG_JSON=1` in env for line-delimited JSON output,
 *   parseable by log aggregators (Loki, Vector, etc.).
 */

type Level = 'info' | 'warn' | 'error'

const JSON_MODE = process.env.AIC_LOG_JSON === '1' || process.env.AIC_LOG_JSON === 'true'

function emit(level: Level, component: string, message: string, context?: Record<string, unknown>): void {
  if (JSON_MODE) {
    const payload = {
      level,
      component,
      message,
      timestamp: new Date().toISOString(),
      ...(context ?? {}),
    }
    const target = level === 'error' || level === 'warn' ? process.stderr : process.stdout
    target.write(JSON.stringify(payload) + '\n')
    return
  }

  const prefix = `[ai-customizer:${component}]`
  const suffix =
    context && Object.keys(context).length > 0
      ? ' ' + Object.entries(context).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
      : ''
  const line = `${prefix} ${message}${suffix}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const log = {
  info: (component: string, message: string, context?: Record<string, unknown>) =>
    emit('info', component, message, context),
  warn: (component: string, message: string, context?: Record<string, unknown>) =>
    emit('warn', component, message, context),
  error: (component: string, message: string, context?: Record<string, unknown>) =>
    emit('error', component, message, context),
}
