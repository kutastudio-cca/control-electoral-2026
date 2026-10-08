# Auditoría de seguridad — Octubre 2026

Alcance: frontend del repositorio (commit `0468ae5`). **El backend (Apps Script)
no estaba disponible**, así que todo lo que depende de él queda marcado como
"verificar en backend".

Severidad: 🔴 alta · 🟠 media · 🟡 baja

## Hallazgos

### 🔴 S1 — Backend fuera del repositorio
La autorización real (quién puede leer/escribir qué) vive en Apps Script y no
se puede auditar. `AUTH.proteger()` solo controla la navegación del frontend;
cualquier usuario con token puede llamar a `API.request('<accion>')` desde la
consola del navegador.
**Verificar en backend:** que cada `accion` valide rol y alcance (ej. un PUNTERO
solo ve su escuela; `listarUsuarios`, `resetCredencial`, `listarAsistencias`
solo ADMIN/roles autorizados).
**Acción:** versionar el Apps Script en `backend/` (con `clasp`) y auditarlo.

### 🔴 S2 — Datos personales identificables sin cifrar en el dispositivo
`pc.html` encola nombre, apellido, **DNI/cédula**, colegio y mesa en
`localStorage` (`dia_cola_pc`). `puntero.html` y `jefe_zona.html` guardan
nombres/apellidos. Un teléfono perdido o compartido expone esos datos; también
quedan en la caché de `CACHE` hasta su expiración.
**Acción:** cifrar la cola con WebCrypto (AES-GCM, clave derivada de la sesión y
descartada al cerrar sesión), purgar la cola apenas se sincroniza, y minimizar
campos (¿hace falta el DNI completo?).

### 🟠 S3 — PIN de 4 dígitos
`admin.html` permite credencial tipo PIN de 4 dígitos (10.000 combinaciones).
**Verificar en backend:** límite de intentos por usuario e IP, bloqueo temporal,
registro de intentos fallidos. Sin eso, el PIN es adivinable en minutos.
**Acción:** PIN de 6 dígitos mínimo + rate limiting + expiración corta de sesión
para roles con PIN.

### 🟠 S4 — Token de sesión en `localStorage`
Cualquier XSS lee el token. Con Apps Script no se pueden usar cookies
`HttpOnly`, así que la defensa es: evitar XSS (S5, S6) y sesiones cortas.
**Verificar en backend:** duración del token, invalidación en `logout`,
revocación al resetear credencial.

### 🟠 S5 — Sin Content-Security-Policy
Ninguna página define CSP. Todo el JS de paneles es inline, así que una CSP
estricta requiere mover scripts a archivos. Paso intermedio:
`<meta http-equiv="Content-Security-Policy">` con `default-src 'self'`,
`connect-src https://script.google.com https://script.googleusercontent.com`,
`script-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline'`,
`img-src 'self' data:`, `object-src 'none'`, `base-uri 'self'`.

### 🟡 S6 — Scripts de CDN sin SRI
`candidato.html:21-22` carga jsPDF y jspdf-autotable sin `integrity`.
**Acción:** agregar `integrity` + `crossorigin="anonymous"`, o servir copia local.

### 🟡 S7 — Uso de `innerHTML`
La mayoría de las interpolaciones pasan por `UTILS.escaparHTML` (bien).
`UI.loader()` (`auth.js`) interpola `mensaje` sin escapar (hoy solo recibe
strings fijos). `UTILS.crearElemento` acepta `innerHTML`. **Acción:** escapar
en `UI.loader` y revisar cada nuevo `innerHTML` con la skill
`auditoria-seguridad`.

### 🟡 S8 — Credencial reseteada mostrada en `alert()`
`admin.html:680` muestra la nueva credencial en un `alert`. Aceptable, pero
conviene un modal con botón "copiar" que no deje rastro en capturas/logs.

### 🟡 S9 — Logout borra la cola sin confirmar sincronización
`AUTH.logout()` espera 1,5 s y vacía todas las colas aunque el envío no haya
terminado → posible pérdida de datos (integridad, no confidencialidad).
**Acción:** esperar el resultado real de `SYNC.forzarSync()`.

## Plan de endurecimiento (Fase 3, pendiente de autorización)

1. Incorporar backend al repo y auditar autorización por acción (S1, S3, S4).
2. Rate limiting + PIN de 6 dígitos + registro de auditoría en backend.
3. Cifrado de colas y caché en el dispositivo (S2).
4. CSP + SRI + escapar `UI.loader` (S5–S7).
5. Logout seguro (S9).
