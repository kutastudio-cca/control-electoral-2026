---
name: revision-datos-personales
description: Revisión de privacidad y cumplimiento para cualquier cambio que agregue, muestre, exporte, cruce o guarde datos de personas (votantes, simpatizantes, usuarios) en Control Electoral 2026. Usar siempre que se toquen campos como nombre, cédula/DNI, teléfono, dirección, barrio, mesa o la base de votantes.
---

# Revisión de datos personales

Referencia obligatoria: `docs/datos-votantes/diseno-base-votantes.md`.
Esto **no reemplaza** la validación de un abogado; señala riesgos.

Para el cambio en revisión, responder cada punto:

1. **Inventario**: ¿qué campos personales nuevos o reutilizados? ¿Dónde se
   guardan (dispositivo, Sheets, base)? ¿Quién los ve?
2. **Necesidad**: ¿cada campo es imprescindible para la finalidad? Proponer
   alternativas (cédula → hash + últimos 3 dígitos; nombre → opcional; agregados
   en vez de filas individuales).
3. **Consentimiento**: si es una persona que no es usuario del sistema, ¿se
   registra consentimiento (fecha, medio, quién)?
4. **Líneas rojas** — bloquear el cambio si:
   - vincula el voto o intención de voto con una persona identificada;
   - permite registrar ofrecimientos, pagos, dádivas o condicionamientos;
   - cruza el padrón del TSJE con datos políticos sin aprobación legal escrita;
   - expone datos a roles que no los necesitan.
5. **Acceso**: ¿qué roles leen? ¿Está restringido en el backend (no solo UI)?
6. **Retención**: ¿cuándo se borra o anonimiza? ¿Se purga del dispositivo?
7. **Exportación**: ¿PDF/CSV incluye datos personales? Si sí, ¿quién puede
   exportar y queda auditado?
8. **Hábeas data**: ¿el dato se puede encontrar, corregir y borrar a pedido?

Salida: tabla `Punto | Estado (OK / Riesgo / Bloqueante) | Acción`. Si hay
bloqueantes, no continuar con el cambio sin decisión explícita del usuario.
