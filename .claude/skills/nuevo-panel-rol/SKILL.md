---
name: nuevo-panel-rol
description: Crear un nuevo panel/rol en Control Electoral 2026 (página HTML + rol en CONFIG + cola SYNC + entrada en sw.js) siguiendo los patrones existentes. Usar cuando se pida agregar un rol, panel o tipo de registro nuevo.
---

# Nuevo panel de rol

1. **Tomar como plantilla** el panel existente más parecido (`chofer.html` para
   registro simple offline, `puntero.html` para tabs, `admin.html` para gestión).
   Copiar estructura: `<head>` con meta PWA + `manifest.json`, header con
   `#header-logo` / `#header-user`, y los scripts en orden
   `config → utils → cache → api → sync → auth`.
2. **Registrar el rol** en `CONFIG.PANEL_POR_ROL` (`assets/js/config.js`).
3. **Proteger la página**: `const usuario = await AUTH.proteger(['NUEVO_ROL']);`
   y salir si devuelve `null`.
4. **Si registra datos offline**: agregar el tipo en `SYNC.CONFIG`
   (`assets/js/sync.js`) con `endpoint` `registrar<X>Batch`, y usar
   `SYNC.encolar('<tipo>', {...})`. El endpoint batch debe existir en el backend
   y ser idempotente por `id_local`.
5. **Si toca datos de personas**: ejecutar la skill `revision-datos-personales`
   antes de terminar.
6. **XSS**: todo dato dinámico en `innerHTML` con `UTILS.escaparHTML()`.
7. **Backend**: la acción nueva debe validar rol y alcance en Apps Script.
   Listar las acciones nuevas en el resumen para que se implementen allí.
8. **PWA**: correr la skill `release-pwa` (subir `CACHE_NAME`).
9. Verificar en navegador con `python3 -m http.server 8000`.
