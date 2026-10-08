# Base de datos de votantes y gestión del Día D — Diseño

Estado: **borrador de diseño, sin implementar**. Antes de cargar datos reales,
un abogado paraguayo debe validar la sección legal.

Usos previstos: base de simpatizantes y contactos de la campaña (uso continuo
entre elecciones) y logística del Día D (asistencia, traslados, fiscalización).

## 1. Marco legal (a validar)

| Norma | Relevancia |
|---|---|
| Constitución Nacional, art. 33 | Derecho a la intimidad |
| Constitución Nacional, art. 135 | Hábeas data: toda persona puede conocer, corregir o pedir la supresión de sus datos |
| Ley 834/96, Código Electoral | Prohíbe coacción y compra de votos y protege el secreto del voto; revisar las reglas sobre traslado de electores el día de la elección |
| Ley 6534/2020 | Datos personales crediticios. Es supletoria y orienta sobre consentimiento |
| Ley general de protección de datos personales | **Confirmar si está promulgada y vigente** y qué exige (registro, responsable, plazos) |
| Padrón del TSJE | Se puede consultar, pero cruzarlo con la simpatía política crea un **perfil político**, que es un dato sensible |

**Principios que el sistema hace cumplir por diseño**

1. **Consentimiento**: no se guarda un contacto sin `consentimiento = true`, la
   fecha, el medio y quién lo registró.
2. **Finalidad**: los datos solo se usan para comunicación de campaña y
   logística voluntaria. **Nunca** para presionar, condicionar ayudas ni
   comprar votos.
3. **Secreto del voto**: no se guarda a quién votó una persona identificada. La
   boca de urna (`voca`) sigue siendo anónima.
4. **Minimización**: la cédula es opcional y se guarda enmascarada para
   mostrarla (`****567`). La búsqueda se hace por un hash con sal.
5. **Hábeas data**: hay un procedimiento para consultar, corregir y borrar
   datos, que se resuelve en 10 días hábiles o en el plazo que fije el abogado.
6. **Conservación limitada**: los datos logísticos del Día D se anonimizan a los
   90 días de la elección. Los contactos sin actividad se borran a los 24 meses
   o en el plazo que se acuerde.
7. **Trazabilidad**: toda lectura masiva, exportación o cambio queda en
   `auditoria`.

## 2. Plataforma recomendada

Migrar de Google Sheets a **PostgreSQL con Row-Level Security**, por ejemplo
Supabase con una región cercana, o un servidor propio. Motivos:

- Permisos por fila: un puntero solo ve sus contactos y un coordinador solo su
  zona.
- Cifrado en reposo, respaldos automáticos y registro de auditoría.
- API con autenticación propia, que reemplaza los tokens caseros.

Transición: mantener Apps Script para el Día D actual y construir la nueva base
para el siguiente ciclo, con una migración por etapas.

## 3. Modelo de datos (borrador)

```
personas
  id               uuid PK
  nombre           text NOT NULL
  apellido         text NOT NULL
  ci_hash          text UNIQUE NULL     -- HMAC-SHA256(ci, sal secreta)
  ci_ultimos3      text NULL            -- solo para mostrar
  telefono         text NULL
  barrio_id        FK barrios
  local_votacion_id FK escuelas NULL
  mesa             int NULL
  consentimiento   bool NOT NULL CHECK (consentimiento)
  consentimiento_fecha  timestamptz NOT NULL
  consentimiento_medio  text NOT NULL   -- 'formulario', 'verbal_testigo', 'web'
  registrado_por   FK usuarios
  responsable_id   FK usuarios          -- puntero a cargo
  creado_en, actualizado_en, borrado_en (soft delete → purga)

interacciones          -- contactos de campaña
  id, persona_id, usuario_id, tipo ('visita','llamada','evento'), nota, fecha
  -- regla: la nota NO puede registrar intención de voto ni ofrecimientos

dia_d_asistencia       -- reemplaza la cola 'asistencia' y 'pc'
  id, eleccion_id, persona_id NULL, escuela_id, mesa, hora, registrado_por

dia_d_traslados        -- reemplaza 'viaje' y 'envio_zona'
  id, eleccion_id, chofer_id, barrio_id, escuela_destino_id, cantidad, hora

elecciones             -- para reutilizar el sistema cada ciclo
  id, nombre, fecha, tipo ('municipal','general','interna')

usuarios, roles, zonas, escuelas, barrios

auditoria
  id, usuario_id, accion, tabla, registro_id, ip, user_agent, fecha
  -- append-only: sin UPDATE/DELETE para ningún rol

solicitudes_habeas_data
  id, persona_id NULL, solicitante, tipo ('acceso','rectificacion','supresion'),
  estado, recibida_en, resuelta_en
```

## 4. Permisos por rol (RLS)

| Rol | personas | interacciones | Día D | auditoria | exportar |
|---|---|---|---|---|---|
| ADMIN | todas | todas | todo | leer | sí, se registra |
| CANDIDATO | solo agregados | — | agregados | — | solo agregados |
| COORDINADOR | su zona | su zona | su zona | — | no |
| JEFE_ZONA | su zona | su zona | su zona | — | no |
| PUNTERO | las suyas | las suyas | su escuela | — | no |
| PC / CHOFER / VOCA | — | — | solo crear lo propio | — | no |

## 5. Próximos pasos

1. Revisión legal de la sección 1, junto con el texto de consentimiento y el
   aviso de privacidad.
2. Auditar el backend actual con el código de Apps Script.
3. Elegir la plataforma y crear el esquema con migraciones versionadas en
   `db/migrations/`.
4. Hacer pruebas de las políticas RLS por rol, antes de cargar datos reales.
5. Escribir el procedimiento de hábeas data y nombrar a un responsable.
