---
name: release-pwa
description: Preparar una publicación de la PWA de Control Electoral 2026 (subir CACHE_NAME en sw.js, VERSION en config.js, verificar lista de archivos cacheados y registro del service worker). Usar al terminar cambios en HTML/CSS/JS/imágenes o antes de un Día D.
---

# Release de la PWA

1. Subir `CACHE_NAME` en `sw.js` (`dia-d2026-vN` → `vN+1`) para que los
   teléfonos descarten la caché vieja.
2. Subir `CONFIG.VERSION` en `assets/js/config.js` (semver: patch para
   arreglos, minor para funciones).
3. Verificar que todo archivo nuevo de `assets/` esencial esté en
   `ARCHIVOS_CACHE` y que no se listen archivos inexistentes
   (`cache.addAll` falla entero si uno no existe).
4. Verificar que cada `.html` registre el service worker y enlace
   `manifest.json`: `grep -L "serviceWorker" *.html` debe salir vacío.
5. Correr la skill `auditoria-seguridad` sobre el diff del release.
6. Probar: `python3 -m http.server 8000`, login, registrar offline, volver
   online, confirmar sincronización (o delegar al agente `qa-offline`).
7. **Antes de un Día D**: congelar cambios 72 h antes; probar en un Android
   gama baja real; confirmar que `CONFIG.FECHA_EVENTO` y candidatos son correctos.
