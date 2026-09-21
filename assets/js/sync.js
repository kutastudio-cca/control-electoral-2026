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
      intervaloMs: 60000,       // 60 seg (bajamos la frecuencia)
      maxBatch: 10,
      maxIntentos: 5,
      prioridad: 2,
      modo: 'auto'              // worker automático
    },
    escrutinio: {
      endpoint: 'cargarVotosBatch',
      intervaloMs: 999999,      // no se usa (modo manual)
      maxBatch: 800,            // batch grande, se manda al cerrar mesa
      maxIntentos: 3,
      prioridad: 1,
      modo: 'manual'            // solo se envía cuando se llama explícitamente
    },
    voca: {
      endpoint: 'registrarVocasBatch',
      intervaloMs: 30000,
      maxBatch: 10,
      maxIntentos: 4,
      prioridad: 4,
      modo: 'auto'
    },
    pc: {
      endpoint: 'registrarPCsBatch',
      intervaloMs: 30000,
      maxBatch: 10,
      maxIntentos: 4,
      prioridad: 3,
      modo: 'auto'
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

    // Si el modo es manual, NO arrancar worker automático
    if (config.modo === 'manual') {
      console.log('[SYNC] Worker manual para', tipo, '- no se autoinicia');
      return;
    }

    const desfase = Math.random() * config.intervaloMs * 0.5;

    setTimeout(() => {
      this._syncAhora(tipo);

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
            // Procesar respuesta
      if (resultado.ok) {
        // El backend devuelve exitosos: [{id_local, ok, id}]
        // Filtramos los que tengan ok=true
        const exitososRaw = resultado.exitosos || [];
        const idsOk = new Set();
        exitososRaw.forEach(e => {
          if (e && e.ok && e.id_local) idsOk.add(e.id_local);
        });

        // Si no vino lista de exitosos, asumimos que todo el batch pasó
        if (exitososRaw.length === 0) {
          batch.forEach(b => idsOk.add(b.id_local));
        }

        // Eliminar los items exitosos de la cola
        cola = cola.filter(item => !idsOk.has(item.id_local));
        this._escribirCola(tipo, cola);

        // Si hubo fallos individuales, marcarlos
        const fallidos = exitososRaw.filter(e => e && e.ok === false);
        if (fallidos.length > 0) {
          const fallidosIds = new Set(fallidos.map(f => f.id_local));
          cola = cola.filter(item => !fallidosIds.has(item.id_local));
          this._escribirCola(tipo, cola);
          UI.toast(`⚠️ ${fallidos.length} registros rechazados por el servidor`, 'error', 6000);
        }
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

    // Cada item debe llevar su id_local para que el backend lo devuelva
    const items = batch.map(item => ({
      ...item.datos,
      id_local: item.id_local
    }));

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
  // ============================================================
  // ENVÍO FORZADO (para cierre de mesa)
  // ============================================================

  /**
   * Envía TODA la cola de un tipo ahora, en un solo batch
   * Devuelve { ok, exitosos, errores, total }
   */
  async enviarTodoAhora(tipo) {
    const config = this.CONFIG[tipo];
    const cola = this._leerCola(tipo);

    if (cola.length === 0) {
      return { ok: true, total: 0, exitosos: 0, errores: 0 };
    }

    if (!navigator.onLine) {
      return { ok: false, total: cola.length, exitosos: 0, errores: cola.length, error: 'Sin conexión' };
    }

    // Batch grande con TODOS los items
    const items = cola.map(item => ({
      ...item.datos,
      id_local: item.id_local
    }));

    try {
      const data = await API.request(config.endpoint, { items: items });

      const exitososRaw = data.exitosos || [];
      const idsOk = new Set();
      exitososRaw.forEach(e => {
        if (e && e.ok && e.id_local) idsOk.add(e.id_local);
      });

      const exitosos = idsOk.size;
      const errores = cola.length - exitosos;

      // Eliminar exitosos de la cola
      const colaRestante = cola.filter(item => !idsOk.has(item.id_local));
      this._escribirCola(tipo, colaRestante);
      this._actualizarIndicador();

      return { ok: errores === 0, total: cola.length, exitosos, errores };

    } catch (err) {
      console.error('[SYNC] enviarTodoAhora falló:', err.message);
      return { ok: false, total: cola.length, exitosos: 0, errores: cola.length, error: err.message };
    }
  },
