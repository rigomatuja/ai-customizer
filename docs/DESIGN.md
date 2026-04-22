# AI Customizer — Technical Design Specification v1.0

**Estado**: Draft compilado de sesión de diseño Q&A (27 bloques de decisión cerrados)
**Autor**: Rodrigo Obalat
**Fecha**: 2026-04-22

---

## 0. Resumen ejecutivo

**AI Customizer** es un sistema de gestión de customizaciones para Claude Code y Opencode.

Consiste en tres piezas que viven en un mismo repo (el "template repo"):

1. **Catálogo**: carpetas versionadas con customs (skills, agents, patches) + un agente manager de fábrica.
2. **Agente manager**: un custom especial que el usuario invoca desde Claude/Opencode para crear, mejorar, versionar, clasificar y adaptar customs.
3. **UI web local** (Hono + Vite + React): orquesta instalación, desinstalación, activación/desactivación y selección de versiones.

**Separación estricta de responsabilidades**:
- El **manager** CREA contenido — no instala, no gestiona permisos.
- La **UI** APLICA y gestiona STATE — nunca edita contenido de customs.

**Tipos soportados**: `skill`, `agent`, `patch`. Los `hook`s son una meta-tag sobre skills/agents con triggers automáticos.

**Scope**: `global` (reusable en cualquier proyecto) o `project` (con metadata del proyecto para categorización y sugerencias).

---

## 1. Principios arquitectónicos

1. **WYSIWYG en disco**: el contenido del catálogo ES literalmente lo que se copia al instalar. Sin transformación runtime.
2. **Paralelismo por tool (Rule B)**: cada custom tiene carpetas paralelas `claude/` y `opencode/`. El manager produce ambas; la UI solo copia.
3. **Versionado por carpeta**: cada versión es una subcarpeta `vX.Y.Z/` (semver). Coexisten.
4. **Manager crea, UI aplica**: separación estricta e inmutable.
5. **Apply atómico**: all-or-nothing. Tracker + backups `.original` + tar.gz rotativo.
6. **Non-blocking validation**: el manager advierte, nunca bloquea. Humano siempre decide.
7. **Declarativo**: los manifests declaran operaciones (`copy`, `jsonMerge`). La UI las ejecuta sin lógica propia.
8. **Idempotencia**: reinstalar produce el mismo resultado. Los patches son find-and-replace determinístico.

---

## 2. Estructura del template repo

```
catalog-template/
├── README.md
├── LICENSE
├── .gitignore
├── .ai-customizer/
│   ├── catalog.json                   # schemaVersion, name
│   └── triggers.json                  # vocabulario de triggers de hooks
├── ui/                                # aplicación UI
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── server/                    # Hono
│       └── client/                    # React + Vite
├── manager/                           # agente manager (ciudadano especial)
│   ├── manifest.json                  # type: agent, category: system
│   └── v0.1.0/
│       ├── claude/manager.md          # subagent Claude
│       └── opencode/manager.md        # primary agent Opencode (mode: primary)
├── customizations/                    # vacío a factory
│   ├── skills/
│   ├── agents/
│   └── patches/
└── application-guide.json
```

**State local del usuario** (fuera del repo):
```
~/.config/ai-customizer/
├── config.json                        # catalogPath + UI settings
├── install-state.json                 # tracker
├── history.json                       # audit log
├── projects.json                      # proyectos registrados
├── hook-registry.json                 # registry global de hooks activos
├── backups/                           # tar.gz (últimos 10, FIFO)
└── .lock                              # lock file con { pid, port }
```

**En proyectos con customs project-local**:
```
<project>/.atl/hook-registry.json     # hooks project-scoped (compat gentle-ai)
```

---

## 3. Tipos de customización

### 3.1 Skill

Markdown con frontmatter que Claude/Opencode cargan como contexto.

| Scope | Claude | Opencode |
|---|---|---|
| global | `~/.claude/skills/<id>/SKILL.md` | `~/.config/opencode/skills/<id>/SKILL.md` |
| project | `<proj>/.claude/skills/<id>/SKILL.md` | `<proj>/.opencode/skills/<id>/SKILL.md` |

### 3.2 Agent

Markdown con frontmatter definiendo un agente invocable. En Claude son subagents; en Opencode pueden ser primary (mode: primary) o subagent.

| Scope | Claude | Opencode |
|---|---|---|
| global | `~/.claude/agents/<id>.md` | `~/.config/opencode/agent/<id>.md` |
| project | `<proj>/.claude/agents/<id>.md` | `<proj>/.opencode/agent/<id>.md` |

### 3.3 Patch

Modifica un archivo master (`CLAUDE.md` o `AGENTS.md`) con find-and-replace sobre una región. Composable vía application-guide.

**Estructura en catálogo**:
```
customizations/patches/<id>/
├── manifest.json
└── v1.0.0/
    ├── claude/              # si target incluye CLAUDE.md
    │   ├── before.md
    │   └── after.md
    └── opencode/            # si target incluye AGENTS.md
        ├── before.md
        └── after.md
```

**`target`**: `"CLAUDE.md"` | `"AGENTS.md"` | `"both"`. Con `"both"`, se generan ambas parejas (Rule B).

**Rutas destino**:
| Scope | Claude | Opencode |
|---|---|---|
| global | `~/.claude/CLAUDE.md` + `.original` | `~/.config/opencode/AGENTS.md` + `.original` |
| project | `<proj>/CLAUDE.md` + `.original` | `<proj>/AGENTS.md` + `.original` |

### 3.4 Hook (meta-tag, NO tipo físico)

Campo `hook` en manifest de skill/agent:

```json
"hook": {
  "triggers": [
    { "type": "phase", "target": "sdd-pipeline:post-design" },
    { "type": "agent-event", "target": "sdd-apply:complete" },
    { "type": "procedure", "target": "pre-pr-creation" }
  ],
  "onFail": "halt"   // halt | warn | continue
}
```

Los hooks NUNCA se disparan por usuario — solo por triggers automáticos. El firing es responsabilidad del **agente consumidor** (orchestrator custom o gentle-ai), que lee `hook-registry.json`.

### 3.5 Scope

Cada custom declara `scope: "global" | "project"`. Si project:

```json
"scope": "project",
"project": {
  "name": "gentle-ai",
  "repoUrl": "https://github.com/...",
  "description": "Orientado a flujos SDD del repo gentle-ai"
}
```

La ubicación de instalación la elige el usuario en la UI (global o project-local, con default según `scope`). La metadata no bloquea — solo informa.

---

## 4. Data contracts

### 4.1 manifest.json — skill / agent

```json
{
  "id": "sdd-review-helper",
  "name": "SDD Review Helper",
  "description": "...",
  "type": "skill",
  "category": "sdd-workflow",

  "scope": "global",
  "project": null,

  "versions": [
    { "version": "1.0.0", "createdAt": "2026-04-22T14:30:00Z", "changelog": "..." },
    { "version": "1.1.0", "createdAt": "2026-04-25T10:00:00Z", "changelog": "..." }
  ],
  "activeVersion": "1.1.0",

  "hook": {
    "triggers": [...],
    "onFail": "halt"
  },

  "dependencies": {
    "gentleAi": { "required": true, "minVersion": "1.20.0" },
    "customs": ["skill:sdd-commons"]
  }
}
```

- `tools` se INFIERE de qué subcarpetas existen en cada versión (`claude/` presente → soporta Claude).
- `hook` es omitible.
- `dependencies.customs` usa formato `"{type}:{id}"`.

### 4.2 manifest.json — patch

```json
{
  "id": "strict-testing-rules",
  "name": "Strict testing rules",
  "type": "patch",
  "category": "persona-overrides",

  "target": "both",

  "scope": "global",
  "project": null,

  "versions": [...],
  "activeVersion": "1.2.0",

  "dependencies": {
    "gentleAi": { "required": false }
  }
}
```

- No lleva `tools` (inferido de `target`).
- No lleva `hook` (patches se aplican en install time).
- `activeVersion` existe aquí, pero `active` + `order` + versión efectiva viven en `application-guide.json`.

### 4.3 application-guide.json (raíz del catálogo)

```json
{
  "schemaVersion": "1.0",
  "targets": {
    "CLAUDE.md": [
      { "patchId": "strict-testing-rules", "version": "1.2.0", "active": true,  "order": 1 },
      { "patchId": "voseo-off",             "version": "2.0.1", "active": false, "order": 2 }
    ],
    "AGENTS.md": [...]
  }
}
```

**Quién edita qué**:
- **Manager**: crea/actualiza entradas al crear/versionar patches.
- **UI**: toggle `active`, cambiar `version` (de entre disponibles), reordenar (`order` via drag & drop), eliminar entrada.

### 4.4 .ai-customizer/catalog.json

```json
{
  "schemaVersion": "1.0",
  "name": "My Catalog",
  "createdAt": "2026-04-22T10:00:00Z"
}
```

### 4.5 .ai-customizer/triggers.json

```json
{
  "schemaVersion": "1.0",
  "triggers": [
    "phase:sdd-pipeline:pre-explore",
    "phase:sdd-pipeline:post-explore",
    "phase:sdd-pipeline:post-propose",
    "phase:sdd-pipeline:post-spec",
    "phase:sdd-pipeline:post-design",
    "phase:sdd-pipeline:post-tasks",
    "phase:sdd-pipeline:post-apply",
    "phase:sdd-pipeline:post-verify",
    "phase:sdd-pipeline:post-archive",
    "agent-event:*:start",
    "agent-event:*:complete",
    "agent-event:*:fail",
    "procedure:pre-pr-creation",
    "procedure:pre-issue-creation",
    "procedure:pre-commit"
  ]
}
```

UI puede añadir nuevos triggers a esta lista. El manager lee este archivo en runtime al validar hooks creados por el usuario. Warn (non-blocking) si trigger desconocido.

### 4.6 install-state.json (tracker)

```json
{
  "schemaVersion": "1.0",
  "catalogPath": "/home/user/code/my-catalog",
  "lastApply": "2026-04-22T14:30:00Z",
  "operations": [
    {
      "opId": "uuid",
      "type": "copy",
      "customId": "sdd-helper",
      "customType": "skill",
      "version": "1.1.0",
      "tool": "claude",
      "scope": "global",
      "projectPath": null,
      "from": "customizations/skills/sdd-helper/v1.1.0/claude/SKILL.md",
      "to": "~/.claude/skills/sdd-helper/SKILL.md",
      "contentHash": "sha256:...",
      "installedAt": "..."
    },
    {
      "opId": "uuid",
      "type": "jsonMerge",
      "customId": "my-agent",
      "version": "2.0.0",
      "tool": "opencode",
      "to": "~/.config/opencode/opencode.json",
      "path": "agent.my-agent",
      "mergedValueHash": "sha256:...",
      "installedAt": "..."
    },
    {
      "opId": "uuid",
      "type": "patchApply",
      "tool": "claude",
      "target": "~/.claude/CLAUDE.md",
      "originalBackup": "~/.claude/CLAUDE.md.original",
      "activeGuideHash": "sha256:...",
      "installedAt": "..."
    }
  ]
}
```

### 4.7 history.json

```json
{
  "schemaVersion": "1.0",
  "entries": [
    {
      "applyId": "uuid",
      "timestamp": "2026-04-22T14:30:00Z",
      "plan": { "install": [...], "upgrade": [...], "uninstall": [...] },
      "result": "success",
      "backupPath": "~/.config/ai-customizer/backups/apply-2026-04-22-143000.tar.gz",
      "error": null,
      "durationMs": 1234
    }
  ]
}
```

### 4.8 projects.json

```json
{
  "schemaVersion": "1.0",
  "projects": [
    {
      "id": "uuid",
      "name": "gentle-ai",
      "path": "/home/user/code/gentle-ai",
      "repoUrl": "https://github.com/..."
    }
  ]
}
```

### 4.9 hook-registry.json

```json
{
  "schemaVersion": "1.0",
  "hooks": [
    {
      "customId": "scaffolding-gate",
      "version": "2.1.0",
      "type": "skill",
      "tool": "claude",
      "scope": "global",
      "installedPath": "~/.claude/skills/scaffolding-gate/SKILL.md",
      "triggers": [ { "type": "phase", "target": "sdd-pipeline:post-design" } ],
      "onFail": "halt"
    }
  ]
}
```

Ubicación dual:
- Global: `~/.config/ai-customizer/hook-registry.json`.
- Project: `<project>/.atl/hook-registry.json` (compat con gentle-ai, que ya usa `.atl/`).

Agentes consumidores walk-up desde cwd, leen project si existe + global, merge con project-wins.

---

## 5. Operaciones del installer

### 5.1 `copy`

```ts
{ op: "copy", from: string, to: string }
```

- Resuelve `from` relativo a catalog root, `to` absoluto (expansión de `~`).
- Crea dirs intermedios.
- Verifica hash si destino existe (drift detection).
- Registra en tracker con `contentHash`.

**Reverso**: delete `to` + cleanup de dirs vacíos ancestros.

### 5.2 `jsonMerge`

```ts
{ op: "jsonMerge", from: string, to: string, path: string }
```

- Lee JSON de `from` (fragmento).
- Lee JSON destino `to` (crea `{}` si no existe).
- Navega `path` (dot-notation), crea intermedios, escribe el valor.
- Registra en tracker con `mergedValueHash`.

**Reverso**: navegar `path`, borrar la rama, limpiar keys intermedias vacías.

### 5.3 `patchApply` (derivado)

No es un op unitario del manifest — es composición derivada de la guía. Por cada target master:

1. Si no existe `<master>.original`, snapshot del master actual como `.original` (primer patch instalado sobre ese master).
2. Cargar `.original` como buffer working.
3. Para cada entry en `application-guide.json[target]` con `active: true`, ordenado por `order`:
   a. Leer `before.md` y `after.md` de `customizations/patches/<patchId>/v<version>/<tool>/`.
   b. Buscar `before.md` en working. Si no matchea → **HARD ERROR + abort del Apply**. Mensaje: "patch `<id>` no se pudo aplicar: before.md no encontrado. Probable conflicto con `<orden previo>`."
   c. Reemplazar con `after.md`.
4. Escribir working al master real.
5. Registrar en tracker (`type: patchApply`, `activeGuideHash`).

### 5.4 Atomicidad all-or-nothing

Proceso de Apply:

1. **Plan**: construir operaciones desde diff (catálogo+active states vs tracker).
2. **Validate**: detectar conflictos de path (manager + UI double-check), validar dependencies (hard-block si no activas), detectar drift vs tracker, detectar orphans.
3. **Dry-run display**: mostrar plan al usuario — install/upgrade/uninstall + warnings + conflicts.
4. **Confirm**: usuario acepta.
5. **Backup pre-apply**: tar.gz de `~/.claude/`, `~/.config/opencode/`, y project dirs afectados → `~/.config/ai-customizer/backups/apply-<timestamp>.tar.gz`. Rotación FIFO de últimos 10.
6. **Execute**: ops secuenciales. Cada op registra éxito/fallo.
7. **On failure**: rollback cada op completada en orden inverso usando tracker. Si rollback falla, restaurar del tar.gz.
8. **On success**: commit entradas al tracker, registrar en `history.json` con `result: "success"`.
9. **On partial rollback**: registrar en history con `result: "rollback"` + error context.

---

## 6. Apply mechanics — secuencia detallada

```
User → UI: click "Apply"
UI → Catalog: read manifests + guide + activeVersion flags
UI → Tracker: read current installed state
UI → Planner: compute diff
  - install: customs active, not in tracker OR version mismatch (upgrade)
  - uninstall: in tracker, not active in catalog (or active:false)
  - patches: compare guide vs trackered active set → patchApply op for each affected master
Planner → Validator:
  - conflict detection (two customs → same path)
  - dependency check (dependencies.customs all active?)
  - drift detection (filesystem hash vs tracker contentHash)
  - gentle-ai dependency check (warn if not satisfied)
  - patches dry-run composition (simulate find-and-replace)
Validator → UI: plan + warnings + errors
UI → User: display plan, require confirm
User → UI: confirm
UI → Backup: tar.gz snapshot
UI → Executor: run ops sequentially
  for each op:
    execute()
    if success: append to completed[]
    if failure:
      for completed.reverse(): reverse()
      if reverse fails: restore from tar.gz
      emit failure event
      return
UI → Tracker: commit new state
UI → History: append entry
UI → HookRegistry: regenerate from currently installed hooks
UI → User: success + summary
```

---

## 7. Manager

### 7.1 Identidad per tool

- **Claude**: subagent en `~/.claude/agents/manager.md`. Invocable por slash `/manager` (comando shipped) y natural language (el primary detecta intent).
- **Opencode**: primary agent en `~/.config/opencode/agent/manager.md` con `mode: primary`. Seleccionable en TUI con Tab.

### 7.2 Ubicación en catálogo

`manager/` en la raíz, FUERA de `customizations/`. Ciudadano especial:
- Factory reset NO lo toca.
- Mismo installer que cualquier custom (Rule: DRY, Q13.e).
- Tiene manifest.
- Tiene versionado `vX.Y.Z/`.

### 7.3 Responsabilidades

1. **Crear** customs con manifest + archivos per-tool.
2. **Mejorar** (nueva versión con changelog).
3. **Versionar** (pregunta user: patch/minor/major, con sugerencia basada en diff).
4. **Clasificar** (scope global/project, metadata si project).
5. **Adaptar** (paridad Claude/Opencode opcional, usuario decide).
6. **Mantener** application-guide.json cuando crea/modifica patches.

### 7.4 Workflow típico (creación)

```
User: "create a skill for API endpoint review"
Manager:
  - Detecta intent "create skill"
  - Pregunta lo que falta: id, description, category, scope, tools, hook?, deps
  - Si scope=project, detecta contexto (cwd? git remote?) o pregunta
  - Si hook=true, valida triggers contra triggers.json (warn si unknown)
  - Propone changelog borrador (v1.0.0 → "Initial release" sugerido)
  - Confirma con user → escribe:
    - customizations/skills/<id>/manifest.json  (activeVersion: "1.0.0", active no existe aquí)
    - customizations/skills/<id>/v1.0.0/claude/SKILL.md
    - customizations/skills/<id>/v1.0.0/opencode/SKILL.md  (si ambos tools)
```

**Default de `active`**: NO toca guide para patches con `active: true` al crear. Para skills/agents, el custom queda inactive en UI (active es UI state, default `false`). User decide instalación desde UI.

### 7.5 Versionado

Cuando user pide modificación:
- Manager muestra diff propuesto.
- Pregunta: "¿patch, minor, o major? Sugerencia: <minor> porque <razón>".
- User confirma.
- Manager crea `vX.Y.Z+1/` con cambios.
- Actualiza `activeVersion` en manifest a la nueva.
- Pregunta changelog (propone borrador).

### 7.6 Self-update

- Manager vive en el template. `git pull` trae `manager/vX.Y+1.0/`.
- UI (file watcher) detecta → banner en Home: "Manager actualizado (v0.1.0 → v0.2.0). [Ver cambios] [Update]".
- Click → op de upgrade añadida al próximo Apply.

### 7.7 Config leído

Manager y UI comparten `~/.config/ai-customizer/config.json`:

```json
{
  "schemaVersion": "1.0",
  "catalogPath": "/home/user/code/my-catalog",
  "installedTools": ["claude", "opencode"]
}
```

### 7.8 Contenido requerido en manager.md

El markdown del manager debe incluir como mínimo:

- Identidad y rol (senior architect, mentor).
- Responsabilidades (las 6 listadas arriba).
- Schemas de manifests (skill, agent, patch) con ejemplos.
- Conocimiento de rutas del catálogo (leído dinámicamente de config.json).
- Instrucción de leer `.ai-customizer/triggers.json` al validar hooks.
- Instrucción de leer `.ai-customizer/catalog.json` para schemaVersion.
- Regla de paridad: default ambos tools, user puede override.
- Regla de versionado: pregunta siempre, sugiere basado en diff.
- Regla de non-blocking validation: warn, user override wins.
- Regla de active default false.
- Regla de proyecto: usuario debe declararlo explícitamente; el manager pregunta si hay ambigüedad.

---

## 8. UI

### 8.1 Stack

- **Server**: Hono sobre Node.
- **Client**: Vite + React.
- **Transport**: JSON REST o tRPC.
- **Watcher**: chokidar sobre `catalogPath` (ignora `node_modules`, `.git`, `dist`).
- **Ejecución**: `cd <catalog>/ui && npm install && npm start` → binds `127.0.0.1:PORT`, abre browser.

### 8.2 Convention de detección

- Default: `path.resolve(__dirname, '..')` es catalog root.
- Valida presencia de `.ai-customizer/catalog.json` en ese path; aborta si falta.
- Override: `CATALOG_PATH=/custom/path npm start` (para dev/testing).

### 8.3 Lock file

Al arrancar: `~/.config/ai-customizer/.lock` con `{ pid, port, startedAt }`. Si existe:
- PID vivo → abort con mensaje "UI ya corriendo en puerto X".
- PID muerto → stale, reemplazar.

### 8.4 Pantallas

1. **Home**: overview (catalog path, counts instalados/disponibles, last apply, pending changes badge, manager update banner si aplica).
2. **Catálogo (browser)**: lista con filtros (tipo, scope + project selector, category, tool support, estado). Search por name/description.
3. **Custom detail**: manifest completo, versions list con changelogs y diff viewer baseline (unified diff o side-by-side), install config (active toggle, version selector, target selector: global / project dropdown), button "Uninstall this custom completely".
4. **Application Guide**: vista por master (CLAUDE.md, AGENTS.md). Lista ordenable drag & drop de patches con toggle active + version selector + delete.
5. **Apply plan**: diff estructurado (install X, upgrade Y, uninstall Z). Warnings (drift, gentle-ai, unknown triggers). Conflicts (si los hay: hard block con mensaje). Confirm / Cancel.
6. **History**: log de applys con timestamp, result, error, enlace a backup tar.gz para restore.
7. **Settings**:
   - Catalog path (cambiable + file picker)
   - Tools: auto-detect (PATH + config dir, estado verde/amarillo/rojo) + user override checkboxes
   - Known projects list (add/edit/delete via file picker)
   - Factory reset (confirmación doble, limpia `customizations/` + `application-guide.json` + cascade uninstall del filesystem)
   - Backups (lista de últimos 10, botón restore, botón clean)
   - About / version info

### 8.5 File watcher

Eventos relevantes:
- Cambios en `.ai-customizer/catalog.json` → invalidar config cache.
- Cambios en `customizations/**/manifest.json` → invalidar catalog model.
- Cambios en `application-guide.json` → invalidar patch model.
- Cambios en `manager/**` → trigger banner manager update.
- Cambio en HEAD SHA del repo (si es git) → banner "catálogo cambió, revisá customs afectados".

### 8.6 Multi-tool install

Cada custom que soporta Claude Y Opencode:
- Default: se instala en todos los tools detectados (auto-detect con user override).
- Override per custom: en detail view, checkboxes "[Install for Claude] [Install for Opencode]".

---

## 9. Bootstrap y factory

### 9.1 First-run wizard

```
1. UI arranca → detecta no existe ~/.config/ai-customizer/config.json.
2. Wizard paso 1: "¿Path al catálogo?"
   - Opción A: Clone canonical template
     - UI conoce URL canónica (baked-in).
     - Pregunta destino → corre `git clone <URL> <dest>`.
     - User termina en <dest>.
     - (Nota: por ahora URL canónica no existe; se define post-validación del dev.)
   - Opción B: "Ya tengo un catálogo clonado" → file picker.
3. UI valida estructura (`.ai-customizer/catalog.json` existe).
4. UI escribe ~/.config/ai-customizer/config.json con catalogPath.
5. Wizard paso 2: Trust scan.
   - UI lee todos los manifests, cuenta customs, detecta hooks auto-disparables, patches sobre masters.
   - Muestra resumen: "Este catálogo contiene X skills, Y agents, Z patches sobre CLAUDE.md, N hooks con triggers auto. ¿Proceder?"
6. Wizard paso 3: Tool detection + install del manager.
   - Detecta Claude/Opencode.
   - Pregunta: "¿Instalar el manager global en [Claude ✓] [Opencode ✓]?"
   - Instala el manager (usando el mismo installer que para cualquier custom).
7. Lleva al Home.
```

### 9.2 Factory state del template

```
catalog-template/
├── README.md                          # explica sistema, cómo usar
├── LICENSE
├── .gitignore                         # ignora node_modules, dist
├── .ai-customizer/
│   ├── catalog.json                   # schemaVersion: 1.0, name vacío
│   └── triggers.json                  # lista inicial de triggers
├── ui/                                # UI completa
│   └── ...
├── manager/                           # manager v0.1.0
│   ├── manifest.json
│   └── v0.1.0/{claude,opencode}/manager.md
├── customizations/
│   ├── skills/.gitkeep
│   ├── agents/.gitkeep
│   └── patches/.gitkeep
└── application-guide.json             # { "targets": { "CLAUDE.md": [], "AGENTS.md": [] } }
```

### 9.3 Factory reset scope

**Limpia solo contenido + cascade uninstall**:
- Cascade uninstall: UI lee tracker, desinstala todos los customs del filesystem (en orden inverso de instalación, atómicamente).
- Borra contenido de `customizations/skills/`, `customizations/agents/`, `customizations/patches/`.
- Resetea `application-guide.json` a `{"targets": {"CLAUDE.md": [], "AGENTS.md": []}}`.
- Deja intactos: `ui/`, `manager/`, `.ai-customizer/`, README.

Confirmación DOBLE requerida en UI (el borrado no es recuperable).

### 9.4 URL canónica del template

Baked-in en UI (hoy: placeholder; se setea cuando el desarrollo se valida).

---

## 10. Catalog integrity

### 10.1 Validación tolerante

Casos detectados al arrancar / refrescar:
- `manifest.json` inválido (JSON roto, schema incorrecto).
- `activeVersion` apunta a carpeta inexistente.
- `application-guide.json` con `patchId` ya borrado.
- `dependencies.customs` referencias rotas.
- Estructura de carpetas esperada ausente.

Comportamiento: badges de error en cards afectadas. Resto de la UI operable. Apply bloqueado sobre customs rotos; los sanos aplican normal.

### 10.2 Cambios externos al catálogo

UI guarda hash del catálogo (HEAD SHA si git, o tree hash de manifests si no). En cada refresh compara.

Al detectar cambio:
- Banner: "El catálogo cambió desde la última sesión. [Ver diff de customs afectados]".
- No secuestra la UX, user decide ignorar o revisar.

### 10.3 Orphans

Custom en tracker que ya no existe en catálogo:
- Vista dedicada "Orphans" en Settings.
- Listados con botón "Uninstall (no longer in catalog)".
- Tracker guarda lo necesario para desinstalar limpiamente.

---

## 11. Seguridad y trust

### 11.1 Trust scan al primer setup

Al apuntar la UI a un catálogo nuevo (primera vez):
- Scan básico: cuenta customs por tipo, detecta hooks auto, patches sobre masters.
- Muestra resumen.
- Requiere confirmación explícita antes de operar.

### 11.2 Non-blocking validations

Lista completa de validaciones que warn pero no bloquean:
- Trigger desconocido en hook (manager + UI).
- Gentle-ai dependency no satisfecha (UI pre-apply).
- Dependencies.customs no activas → **bloqueante** (único caso hard-block).
- Drift detectado → warn con opción sobreescribir / abort.
- Manager con versión nueva disponible → banner.

---

## 12. Decisiones diferidas a v2

- **Multi-target install**: un custom instalado en múltiples targets simultáneos. v1 = single-target.
- **Profiles**: snapshots nombrados de estados de activación.
- **Import/export individual**: compartir un custom sin clonar catálogo entero (git ya resuelve v1).
- **Multi-catalog concurrente**: múltiples catálogos activos. v1 = uno por vez (lock file).
- **Query builder avanzado** (search DSL).
- **Diff viewer avanzado** (hunks + filter por tool + git blame).
- **Auto-update UI**.
- **Schema migration auto-silenciosa**.
- **Hooks nativos Claude** (`settings.json` hooks) — explícitamente fuera de scope.

---

## 13. Glosario

- **Catálogo**: repo local del usuario, clonado del template, donde viven los customs.
- **Custom**: una unidad de customización (skill, agent, patch).
- **Manager**: agente especial responsable de crear/mejorar/versionar customs.
- **UI**: aplicación web local (Hono + React) que gestiona instalación.
- **Master**: archivo raíz de configuración del tool (`~/.claude/CLAUDE.md`, `~/.config/opencode/AGENTS.md`).
- **Tracker**: `install-state.json` — registra ops de install para rollback preciso.
- **Application guide**: `application-guide.json` — orden + estado de patches por master.
- **Hook registry**: `hook-registry.json` — hooks activos descubribles por orchestrators.
- **Factory state**: estado inicial del catálogo (manager + vacío).
- **Factory reset**: cascade uninstall + reset de `customizations/` + `application-guide.json`.
- **Apply**: operación de sync desired-state (catálogo + active flags) → actual-state (filesystem).

---

## 14. Apéndice A — Decisiones (27 bloques)

| # | Tema | Decisión |
|---|---|---|
| 1 | Topología catálogo | Repo template genérico; user clona; UI apunta al path local; factory reset disponible. |
| 2 | Organización per-tool | Rule B: carpetas paralelas `claude/` + `opencode/` por custom. |
| 3 | Versionado | Carpeta por versión semver + `activeVersion` en manifest. |
| 4 | Patches | `{before, after}` + `application-guide.json` en raíz; find-and-replace en serie. |
| 5 | Tipos | skill, agent, patch. Hook = meta-tag sobre skill/agent, trigger auto. |
| 6 | Scope | global/project con metadata; install target elegible por user con defaults inteligentes. |
| 7 | Manifest schema | Definido con `tools` inferido y `dependencies.gentleAi` estructurado. |
| 8 | Install ops | `copy` + `jsonMerge` simétrico vía path dot-notation. |
| 9 | UI runtime | Hono + Vite + React, local server + browser. |
| 10 | Sync model | Apply explícito + tracker único. |
| 11 | Paths install | Paridad completa Claude/Opencode (global + project-local). |
| 12 | Manager workflow | Version bump elegible (pregunta), paridad opcional, active:false al crear, changelog sugerido, config compartido. |
| 13 | Bootstrap | Wizard + manager fuera de customizations + factory reset cascade + mismo installer. |
| 14 | Apply mechanics | Atomic all-or-nothing, conflict detection doble, hard error en patches rotos, drift warning. |
| 15 | Hook firing | Registry A.1 (`hook-registry.json`) dual global + project con compat gentle-ai. |
| 16 | UI structure | 6 pantallas + Settings, multi-tool con override per custom, tracker único. |
| 17 | Multi-target | Single-target v1. |
| 18 | gentle-ai dep | Detect + warn (non-blocking). |
| 19 | Manager identity | Invocación per tool (Claude: slash + NL / Opencode: primary TUI); identidad = agent; backups tar.gz FIFO N=10. |
| 20 | Integridad | Validación tolerante, notificación externa, orphans view + force-uninstall. |
| 21 | Deps + updates | Deps.customs bloqueante; manager self-update via banner; patch `both` con Rule B. |
| 22 | Project ID + schema + diff | Lista persistente + file picker; migration explícita con backup; diff viewer baseline. |
| 23 | Detection + trust + triggers | Auto-detect (PATH + config) + override manual; trust scan único; vocabulario curado extensible. |
| 24 | Retention + search + import | Backups FIFO N=10; search intermedio (chips + dropdowns); import/export solo git v1. |
| 25 | Watcher + profiles + log | File watcher activo; sin profiles v1; history.json log persistente. |
| 26 | Template + update + concurrency | URL canónica (a definir); UI no es npm-package (updates via git pull); lock file. |
| 27 | Reframed architecture | UI + manager + catálogo en UN repo; state en user home; factory reset = contenido only; detection por convention + env override. |

---

## 15. Preguntas abiertas para implementación

Cosas que emergen mejor en código:

1. **Transport UI ↔ server**: JSON REST vs tRPC. Para un monorepo TS ambos son válidos. tRPC da type-safety end-to-end; REST es más portable.
2. **Estado local de la UI**: Zustand / Jotai / Redux Toolkit / Context API. Recomendación: Zustand para state app-wide (plan pendiente, settings) + React Query para server state (catálogo, tracker).
3. **Diff library**: `react-diff-viewer-continued` o `diff2html-react` como baseline.
4. **Watcher debouncing**: cambios en rápida sucesión (git pull, guardados múltiples). Debounce ~300ms antes de refresh.
5. **JSON merge library**: `deepmerge` o implementación propia. Preferir propia para controlar bien el comportamiento del path dot-notation en uninstall.
6. **Lock file robustness**: `proper-lockfile` (npm) da la semántica correcta out-of-the-box.
7. **Testing**: golden snapshots de install outputs (siguiendo patrón de gentle-ai). Unit tests de planner, validator, executor. E2E con fixture catalog.
8. **Estructura del manager.md real**: el contenido concreto del prompt del agente. Requiere iteración empírica con el manager vivo; documentar output format, validaciones, ejemplos de Q&A.
9. **Manejo de errores de I/O**: permisos, disk full, archivos en uso. Surface al usuario con sugerencias concretas.
10. **Migrations entre versiones de schema**: estructura del migrator + tests.

---

**Fin del documento.**
