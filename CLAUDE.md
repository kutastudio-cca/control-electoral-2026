# Control Electoral 2026 (DIA_D2026)

PWA para la gestión del día de elecciones (Día D) de la Lista 1 — elecciones
municipales de Paraguay (concejal + intendente). Proyecto de largo plazo: se
mejora entre ciclos electorales.

## Arquitectura

- **Frontend**: HTML + CSS + JavaScript vanilla, sin build ni framework. Cada rol
  tiene su propia página `.html` con el JS del panel inline al final del archivo.
- **Módulos compartidos** (`assets/js/`), cargados en este orden en cada página:
  `config.js` → `utils.js` → `cache.js` → `api.js` → `sync.js` → `auth.js`.
  - `config.js` — `CONFIG` global: URL del backend, candidatos, `PANEL_POR_ROL`.
  - `api.js` — `API.request(accion, datos)`: POST `text/plain` a Apps Script con
    `{ accion, token, ...datos }`. Respuesta `{ ok, data, error, codigo }`.
  - `sync.js` — cola offline en `localStorage` (`dia_cola_<tipo>`), envío por
    lotes con jitter, reintentos e idempotencia por `id_local`.
  - `auth.js` — `AUTH.proteger([roles])` en cada panel (valida con `API.me()`),
    más helpers `UI` (toast, loader).
  - `utils.js` — formato `es-PY`, `escaparHTML`, sesión en `localStorage`.
- **Backend**: Google Apps Script publicado como Web App + Google Sheets.
  **Su código aún no está en el repo** (pendiente: agregarlo en `backend/`).
  Toda la autorización real debe vivir ahí; el frontend solo es UX.
- **PWA**: `manifest.json` + `sw.js` (network-first, no intercepta POST ni
  `script.google.com`). Al cambiar assets, subir `CACHE_NAME` en `sw.js`.

## Roles y datos que maneja cada uno

| Rol | Página | Tipo de cola | Datos |
|---|---|---|---|
| ADMIN | `admin.html` | — | usuarios, credenciales, teléfonos |
| CANDIDATO | `candidato.html` | — | totales, reportes PDF (jsPDF por CDN), gastos |
| PC | `pc.html` | `pc` | **nombre, apellido, DNI/cédula, colegio, mesa, observaciones** |
| COORDINADOR | `coordinador.html` | — | supervisión por colegio |
| JEFE_ZONA | `jefe_zona.html` | `envio_zona` | apellido de familia, cantidad, zona/barrio |
| PUNTERO | `puntero.html` | `asistencia`, `escrutinio` | nombre (opcional) + mesa; votos por mesa |
| VOCA | `voca.html` | `voca` | boca de urna anónima (lista/candidato) |
| CHOFER | `chofer.html` | `viaje` | cantidad, barrio, colegio destino |

## Reglas del proyecto

1. **Datos personales**: cualquier cambio que agregue, muestre, exporte o guarde
   datos de personas (votantes, simpatizantes, usuarios) pasa por la skill
   `revision-datos-personales` y el agente `revisor-legal-datos`. Ver
   `docs/datos-votantes/diseno-base-votantes.md`.
2. **Nunca** usar datos para presionar, condicionar ayudas o comprar votos; no
   guardar el voto individual de una persona identificada.
3. **XSS**: todo dato dinámico en `innerHTML` va por `UTILS.escaparHTML()`.
   Preferir `textContent`.
4. **Autorización en el backend**, nunca solo en el frontend.
5. **No commitear secretos** (claves, credenciales, exportaciones de Sheets).
6. Scripts externos solo desde cdnjs con versión fija (+ SRI cuando se agregue).
7. Textos de UI en español rioplatense/paraguayo (voseo: "Ingresá", "Revisá").
8. Mantener el patrón existente: objetos globales en MAYÚSCULAS (`API`, `SYNC`,
   `UI`), comentarios de sección `// ---------- X ----------`.

## Cómo probar

No hay tests ni build. Servir estático: `python3 -m http.server 8000` y abrir
`http://localhost:8000`. Para flujos offline usar el agente `qa-offline`
(Playwright con Chromium preinstalado; `context.setOffline(true)`).

## Herramientas Claude del proyecto

- Skills (`.claude/skills/`): `nuevo-panel-rol`, `auditoria-seguridad`,
  `revision-datos-personales`, `release-pwa`.
- Agentes (`.claude/agents/`): `arquitecto-electoral`, `auditor-seguridad`,
  `revisor-legal-datos`, `qa-offline`.

## Documentación

- `docs/seguridad/auditoria-2026-10.md` — hallazgos y plan de endurecimiento.
- `docs/datos-votantes/diseno-base-votantes.md` — diseño de la base de votantes
  y marco legal (requiere validación de abogado paraguayo).
