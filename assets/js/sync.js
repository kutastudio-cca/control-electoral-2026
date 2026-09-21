/* ============================================================
   DIA_D2026 — sync.js
   Cola persistente + sincronización por lotes (batch)
   ============================================================ */

const SYNC = {

  PREFIX: 'dia_cola_',

  CONFIG: {
    asistencia: {
      endpoint: 'registrarAsistenciasBatch',
      intervaloMs: 60000,
      maxBatch: 10,
      maxIntentos: 5,
      prioridad: 2,
      modo: 'auto'
    },
    escrutinio: {
      endpoint: 'cargarVotosBatch',
      intervaloMs: 999999,
      maxBatch: 800,
      maxIntentos: 3,
      prioridad: 1,
      modo: 'manual'
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

  _workers: {},
  _enviando: {},

  // ============================================================
  // INICIALIZACIÓN
  // ============================================================
  iniciar() {
    CACHE.limpiarExpirados();

    Object.keys(this.CONFIG).forEach(tipo => {
      this._arrancarWorker(tipo);
    });

    window.addEventListener('online', () => {
      UI.toast('🌐 Conexión restaurada', 'exito');
      this.forzarSync();
    });

    window.addEventListener('offline', () => {
      UI.toast('⚠️ Sin conexión. Los datos se guardan localmente.', 'alerta', 5000);
    });

    console.log('[SYNC] Iniciado. Pendientes:', this.contarPendientes());
  },

  // ============================================================
  // ENCOLAR
  // ============================================================
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

  forzarSync() {
    Object.keys(this.CONFIG).forEach(tipo => {
      this._syncAhora(tipo);
    });
  },

  // ============================================================
  // SYNC (worker automático)
  // ============================================================
  async _syncAhora(tipo) {
    if (this._enviando[tipo]) return;

    const config = this.CONFIG[tipo];
    let cola = this._leerCola(tipo);

    if (cola.length === 0) return;

    if (!navigator.onLine) return;

    this._enviando[tipo] = true;

    try {
      const batch = cola.slice(0, config.maxBatch);
      const resultado = await this._enviarBatch(tipo, batch);

      if (resultado.ok) {
        const exitososRaw = resultado.exitosos || [];
        const idsOk = new Set();

        exitososRaw.forEach(e => {
          if (e && e.ok && e.id_local) idsOk.add(e.id_local);
        });

        if (exitososRaw.length === 0) {
          batch.forEach(b => idsOk.add(b.id_local));
        }

        const colaActual = this._leerCola(tipo);
        const colaRestante = colaActual.filter(item => !idsOk.has(item.id_local));
        this._escribirCola(tipo, colaRestante);

        const fallidos = exitososRaw.filter(e => e && e.ok === false);
        if (fallidos.length > 0) {
          const fallidosIds = new Set(fallidos.map(f => f.id_local));
          const cola2 = this._leerCola(tipo).filter(item => !fallidosIds.has(item.id_local));
          this._escribirCola(tipo, cola2);
          UI.toast(`⚠️ ${fallidos.length} registros rechazados`, 'error', 6000);
        }
      } else {
        batch.forEach(item => {
          const cola2 = this._leerCola(tipo);
          const encontrado = cola2.find(c => c.id_local === item.id_local);
          if (encontrado) {
            encontrado.intentos = (encontrado.intentos || 0) + 1;
            encontrado.ultimoError = resultado.error;
          }
          this._escribirCola(tipo, cola2);
        });

        const colaFinal = this._leerCola(tipo);
        const itemsFallidos = colaFinal.filter(item => item.intentos >= config.maxIntentos);
        if (itemsFallidos.length > 0) {
          const idsFallidos = new Set(itemsFallidos.map(f => f.id_local));
          const colaLimpia = colaFinal.filter(item => !idsFallidos.has(item.id_local));
          this._escribirCola(tipo, colaLimpia);
          UI.toast(`⚠️ ${itemsFallidos.length} registros descartados`, 'error', 8000);
        }
      }

    } catch (err) {
      console.error('[SYNC] Error en', tipo, err.message);
    } finally {
      this._enviando[tipo] = false;
    }
  },

  async _enviarBatch(tipo, batch) {
    const config = this.CONFIG[tipo];

    const items = batch.map(item => ({
      ...item.datos,
      id_local: item.id_local
    }));

    try {
      const data = await API.request(config.endpoint, { items: items });
      return { ok: true, exitosos: data.exitosos || [] };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  // ============================================================
  // ENVÍO FORZADO (para cierre de mesa)
  // ============================================================
  async enviarTodoAhora(tipo) {
    const config = this.CONFIG[tipo];
    const cola = this._leerCola(tipo);

    if (cola.length === 0) {
      return { ok: true, total: 0, exitosos: 0, errores: 0 };
    }

    if (!navigator.onLine) {
      return { ok: false, total: cola.length, exitosos: 0, errores: cola.length, error: 'Sin conexión' };
    }

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

      const colaRestante = cola.filter(item => !idsOk.has(item.id_local));
      this._escribirCola(tipo, colaRestante);

      return { ok: errores === 0, total: cola.length, exitosos, errores };

    } catch (err) {
      console.error('[SYNC] enviarTodoAhora falló:', err.message);
      return { ok: false, total: cola.length, exitosos: 0, errores: cola.length, error: err.message };
    }
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
  // DEBUG
  // ============================================================
  debug() {
    const pendientes = this.contarPendientes();
    console.log('[SYNC] Pendientes:', pendientes);
    return pendientes;
  }
};
