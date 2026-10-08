---
name: auditoria-seguridad
description: Checklist de seguridad específico de Control Electoral 2026 para revisar un cambio o el repo completo (XSS, autorización, sesión, datos en dispositivo, CSP, secretos). Usar antes de commitear cambios en paneles, assets/js, sw.js o backend.
---

# Auditoría de seguridad

Revisar el diff (`git diff` o el rango indicado) contra esta lista. Reportar
cada hallazgo con `archivo:línea`, severidad (🔴/🟠/🟡) y arreglo propuesto.
Comparar con `docs/seguridad/auditoria-2026-10.md` y actualizarlo si cambia
el estado de algún hallazgo.

## Frontend
- [ ] Toda interpolación en `innerHTML`/template strings usa `UTILS.escaparHTML`
      (buscar `innerHTML`, `insertAdjacentHTML`, `${` dentro de HTML).
- [ ] No hay `eval`, `new Function`, `setTimeout(string)`, `document.write`.
- [ ] Scripts externos: solo cdnjs, versión fija, con `integrity`.
- [ ] No se guardan nuevos datos personales en `localStorage`/`CACHE` sin cifrar
      ni sin purga tras sincronizar.
- [ ] `AUTH.proteger([...])` con la lista mínima de roles.
- [ ] Nada sensible en `console.log` (tokens, DNI, teléfonos).

## Backend (Apps Script)
- [ ] Cada `accion` valida token, expiración, rol **y alcance** (escuela/zona).
- [ ] Login con límite de intentos y bloqueo temporal.
- [ ] Credenciales hasheadas con sal (nunca en texto plano en la Sheet).
- [ ] Endpoints batch idempotentes por `id_local`.
- [ ] Acciones sensibles (reset, exportar, listar personas) registradas en auditoría.

## Repo
- [ ] Sin secretos ni exportaciones de datos commiteadas
      (`git diff --cached | grep -iE "password|secret|apikey|token"`).
- [ ] `sw.js` no cachea respuestas del backend ni POST.
