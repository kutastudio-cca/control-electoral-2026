/* ============================================================
   DIA_D2026 — sync.js
   Cola persistente + sincronización por lotes (batch)
   ============================================================ */

const SYNC = {

  // Prefijo de las colas en localStorage
  PREFIX: 'dia_cola_',

  // Configuración por tipo de operación
  CONFIG: {
    asistencia: {
      endpoint: 'registrarAsistenciasBatch',
      intervaloMs: 15000,       // 15 seg
      maxBatch: 10,
      maxIntentos: 5,
      prioridad: 2              // 1 = más alto, 5 = más bajo
    },
    escrutinio: {
      endpoint: 'cargarVotosBatch',
      intervaloMs: 10000,       // 10 seg
      maxBatch: 20,
      maxIntentos: 5,
      prioridad: 1
    },
    voca: {
      endpoint: 'registrarVocasBatch',
      intervaloMs: 30000,       // 30 seg
      maxBatch: 10,
      maxIntentos: 4,
      prioridad: 4
    },
    pc: {
      endpoint: 'registrarPCsBatch',
      intervaloMs: 30000,       // 30 seg
      maxBatch: 10,
      maxIntentos: 4,
      prioridad: 3
    }
  },

  // Estado interno del worker
  _workers: {},
  _enviando: {},

  // ============================================================
  // INICIALIZACIÓN
  // ============================================================

  iniciar() {
    // Limpiar expirados del cache
    CACHE.limpiarExpirados();

    // Arrancar worker para cada tipo
    Object.keys(this.CONFIG).forEach(tipo => {
      this._arrancarWorker(tipo);
    });

    // Escuchar cambios de conexión
    window.addEventListener('online', () => {
      UI.toast('🌐 Conexión restaurada. Sincronizando...', 'exito');
      this.forzarSync();
    });

    window.addEventListener('offline', () => {
      UI.toast('⚠️ Sin conexión. Los datos se guardan localmente.', 'alerta', 5000);
    });

    // Sincronizar antes de cerrar la pestaña (best-effort)
    window.addEventListener('beforeunload', (e) => {
      const pendientes = this.contarPendientes();
      if (pendientes.total > 0) {
        // No podemos async en beforeunload, pero intentamos un beacon
        this._beaconSync();
      }
    });

    console.log('[SYNC] Iniciado. Pendientes:', this.contarPendientes());
  },

  // ============================================================
  // AGREGAR ITEMS A LA COLA
  // ============================================================

  /**
   * Agrega un item a la cola
   * @param {string} tipo - 'asistencia' | 'escrutinio' | 'voca' | 'pc'
   * @param {object} datos - Datos a enviar
   * @returns {string} id local del item
   */
  encolar(tipo, datos) {
    if (!this.CONFIG[tipo]) {
      throw new Error('Tipo de sync no válido: ' + tipo);
    }

    const cola = this._leerCola(tipo);
    const item = {
      id_local: this._generarId(),
      datos: datos,
      timestamp: Date.now(),
      intentos: 0,
      ultimoError: null
    };
    cola.push(item);
    this._escribirCola(tipo, cola);

    // Actualizar indicador visual
    this._actualizarIndicador();

    // Disparar sync del tipo si es urgente
    if (this.CONFIG[tipo].prioridad === 1) {
      this._syncAhora(tipo);
    }

    return item.id_local;
  },

  // ============================================================
  // CONTAR PENDIENTES
  // ============================================================

  contarPendientes() {
    const totales = {};
    let total = 0;
    Object.keys(this.CONFIG).forEach(tipo => {
      const cola = this._leerCola(tipo);
      totales[tipo] = cola.length;
      total += cola.length;
    });
    return { total, porTipo: totales };
  },

  // ============================================================
  // WORKERS
  // ============================================================

  _arrancarWorker(tipo) {
    if (this._workers[tipo]) return;

    const config = this.CONFIG[tipo];

    // Desfase aleatorio inicial (0 a intervalo * 0.5)
    const desfase = Math.random() * config.intervaloMs * 0.5;

    setTimeout(() => {
      // Sync inicial
      this._syncAhora(tipo);

      // Sync periódico
      this._workers[tipo] = setInterval(() => {
        this._syncAhora(tipo);
      }, config.intervaloMs);
    }, desfase);
  },

  /**
   * Fuerza la sincronización de TODOS los tipos
   */
  forzarSync() {
    Object.keys(this.CONFIG).forEach(tipo => {
      this._syncAhora(tipo);
    });
  },

  // ============================================================
  // SYNC
  // ============================================================

  async _syncAhora(tipo) {
    // Evitar sync simultáneo del mismo tipo
    if (this._enviando[tipo]) return;

    const config = this.CONFIG[tipo];
    let cola = this._leerCola(tipo);

    if (cola.length === 0) return;

    // Verificar conexión
    if (!navigator.onLine) {
      this._actualizarIndicador();
      return;
    }

    this._enviando[tipo] = true;

    try {
      // Tomar los primeros N items
      const batch = cola.slice(0, config.maxBatch);

      // Enviar al backend
      const resultado = await this._enviarBatch(tipo, batch);

      // Procesar respuesta
      if (resultado.ok) {
        // Eliminar los items exitosos de la cola
        const idsExitosos = new Set(resultado.exitosos || batch.map(b => b.id_local));
        cola = cola.filter(item => !idsExitosos.has(item.id_local));
        this._escribirCola(tipo, cola);
      } else {
        // Marcar intentos
        batch.forEach(item => {
          const encontrado = cola.find(c => c.id_local === item.id_local);
          if (encontrado) {
            encontrado.intentos = (encontrado.intentos || 0) + 1;
            encontrado.ultimoError = resultado.error;
          }
        });
        // Eliminar items que superaron maxIntentos
        const itemsFallidos = cola.filter(item => item.intentos >= config.maxIntentos);
        if (itemsFallidos.length > 0) {
          cola = cola.filter(item => item.intentos < config.maxIntentos);
          console.warn('[SYNC] Items descartados por exceder intentos:', itemsFallidos.length);
          UI.toast(`⚠️ ${itemsFallidos.length} registros descartados tras ${config.maxIntentos} intentos`, 'error', 8000);
        }
        this._escribirCola(tipo, cola);
      }

    } catch (err) {
      console.error('[SYNC] Error en', tipo, err.message);
      // No marcar intentos acá, ya se marca en el catch específico
    } finally {
      this._enviando[tipo] = false;
      this._actualizarIndicador();
    }
  },

  async _enviarBatch(tipo, batch) {
    const config = this.CONFIG[tipo];
    const items = batch.map(item => item.datos);

    try {
      const data = await API.request(config.endpoint, { items: items });
      return { ok: true, exitosos: data.exitosos || [] };
    } catch (err) {
      // Contar intentos de cada item
      batch.forEach(item => {
        const cola = this._leerCola(tipo);
        const encontrado = cola.find(c => c.id_local === item.id_local);
        if (encontrado) {
          encontrado.intentos = (encontrado.intentos || 0) + 1;
          encontrado.ultimoError = err.message;
        }
      });
      return { ok: false, error: err.message };
    }
  },

  // ============================================================
  // BEACON (envío rápido al cerrar)
  // ============================================================

  _beaconSync() {
    // Intento best-effort de enviar la cola al cerrar
    // No garantiza entrega pero ayuda
    Object.keys(this.CONFIG).forEach(tipo => {
      const cola = this._leerCola(tipo);
      if (cola.length === 0) return;

      const config = this.CONFIG[tipo];
      const payload = JSON.stringify({
        accion: config.endpoint,
        token: UTILS.obtenerToken(),
        items: cola.map(i => i.datos)
      });

      // Enviar como beacon (no espera respuesta)
      if (navigator.sendBeacon) {
        try {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(CONFIG.API_URL, blob);
        } catch (e) {}
      }
    });
  },

  // ============================================================
  // HELPERS DE COLA
  // ============================================================

  _leerCola(tipo) {
    try {
      const raw = localStorage.getItem(this.PREFIX + tipo);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  _escribirCola(tipo, cola) {
    try {
      localStorage.setItem(this.PREFIX + tipo, JSON.stringify(cola));
    } catch (e) {
      console.error('[SYNC] No se pudo escribir cola:', tipo, e.message);
    }
  },

  _generarId() {
    return 'tmp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  },

  // ============================================================
  // INDICADOR VISUAL
  // ============================================================

  _actualizarIndicador() {
    const cont = document.getElementById('sync-indicator');
    if (!cont) return;

    const pendientes = this.contarPendientes();
    const online = navigator.onLine;

    if (!online) {
      cont.innerHTML = `<span class="badge badge-error">🔴 Sin conexión${pendientes.total > 0 ? ' · ' + pendientes.total : ''}</span>`;
    } else if (pendientes.total === 0) {
      cont.innerHTML = `<span class="badge badge-exito">🟢 Sincronizado</span>`;
    } else {
      cont.innerHTML = `<span class="badge badge-alerta">🟡 ${pendientes.total} pendiente${pendientes.total !== 1 ? 's' : ''}</span>`;
    }
  },

  // ============================================================
  // DEBUG
  // ============================================================

  debug() {
    const pendientes = this.contarPendientes();
    console.log('[SYNC] Pendientes:', pendientes);
    Object.keys(this.CONFIG).forEach(tipo => {
      const cola = this._leerCola(tipo);
      if (cola.length > 0) {
        console.log('  -', tipo + ':', cola.length, 'items');
      }
    });
    return pendientes;
  }
};
