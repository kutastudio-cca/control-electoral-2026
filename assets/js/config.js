/* ============================================================
   DIA_D2026 — config.js
   Configuración global
   ============================================================ */

const CONFIG = {
  // URL del backend (Apps Script publicado como Web App)
  API_URL: 'https://script.google.com/macros/s/AKfycbzws3QiWo6oAKPwRWlXXikTTToDdAaRjGDZj-XDGIJ5OFVdJ1Y2ZA-pmoUiFdoVN-Ni2A/exec',

  // Nombre del sistema
  SISTEMA_NOMBRE: 'Control Electoral 2026',
  SISTEMA_SUBTITULO: 'Lista 1 — Pablo Alderete Concejal',

  // Fecha del evento
  FECHA_EVENTO: '2026-10-04',

  // Nombres de candidatos
  CANDIDATOS: {
    concejal_nuestro:    'Pablo Alderete',
    intendente_nuestro:  'Varon Ovelar',
    intendente_opositor: 'Elvio Coronel'
  },

  // Rutas de paneles por rol
  PANEL_POR_ROL: {
    ADMIN:       'admin.html',
    CANDIDATO:   'candidato.html',
    COORDINADOR: 'coordinador.html',
    PUNTERO:     'puntero.html',
    VOCA:        'voca.html',
    CHOFER:      'chofer.html'
  },

  // Claves de almacenamiento local
  STORAGE: {
    TOKEN:    'dia_d2026_token',
    USUARIO:  'dia_d2026_usuario',
    EXPIRA:   'dia_d2026_expira'
  },

  // Configuración de auto-refresh (ms)
  REFRESH_INTERVALO: 30000,

  // Versión
  VERSION: '1.0.0'
};
