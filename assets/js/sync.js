/* ============================================================
   DIA_D2026 — sync.js v2.0
   Cola persistente + sincronización por lotes (batch)
   Con jitter dinámico + sync por evento + idempotencia
   ============================================================ */

const SYNC = {

  PREFIX: 'dia_cola_',

  // ============================================================
  // CONFIGURACIÓN POR TIPO
  // ============================================================
  CONFIG: {
    asistencia: {
      endpoint: 'registrarAsistenciasBatch',
      intervaloBase: 180000,     // 3 min
      jitterMax: 30000,          // ±30 seg
      maxBatch: 20,
      maxIntentos: 5,
      umbralEvento: 5,           // sync por evento si ≥ 5
      modo: 'auto'
    },
    escrutinio: {
      endpoint: 'cargarVotosBatch',
      intervaloBase: 999999999,  // no se usa (modo manual)
      jitterMax: 0,
      maxBatch: 800,
      maxIntentos: 3,
      umbralEvento: 999999,      // nunca dispara por evento
      modo: 'manual'
    },
    voca: {
      endpoint: 'registrarVocasBatch',
      intervaloBase: 180000,
      jitterMax: 30000,
      maxBatch: 20,
      maxIntentos: 4,
      umbralEvento: 5,
      modo: 'auto'
    },
    pc: {
      endpoint: 'registrarPCsBatch',
      intervaloBase: 180000,
      jitterMax: 30000,
      maxBatch: 20,
      maxIntentos: 4,
      umbralEvento: 10,
      modo: 'auto'
    },
    viaje: {
      endpoint: 'registrarViajesBatch',
      intervaloBase: 180000,
      jitterMax: 30000,
      maxBatch: 20,
      maxIntentos: 4,
      umbralEvento: 3,
      modo: 'auto'
    },
    envio_zona: {
      endpoint: 'registrarEnviosZonaBatch',
      intervaloBase: 180000,
      jitterMax: 30000,
      maxBatch: 20,
      maxIntentos: 4,
      umbralEvento: 3,
      modo: 'auto'
    }
  },

  _workers: {},
  _enviando: {},
  _ultimoManual: 0,
  _intervaloIndicadores: null,

  // ============================================================
  // INICIALIZACIÓN
  // ============================================================
  iniciar() {
    CACHE.limpiarExpirados();

    // Arrancar workers por tipo (solo los que son modo 'auto')
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
      this._actualizarIndicadores();
    });

    // Actualizar indicador cada 2 seg
    if (!this._intervaloIndicadores) {
      this._intervaloIndicadores = setInterval(() => {
        this._actualizarIndicadores();
      }, 2000);
    }

    // Intentar sync inicial (si hay pendientes)
    setTimeout(() => {
      this.forzarSync();
    }, 1000);

    this._actualizarIndicadores();

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

    // ⭐ Sync por evento: si supera el umbral, sincronizar ahora
    const config = this.CONFIG[tipo];
    if (config.modo === 'auto' && cola.length >= config.umbralEvento) {
      console.log('[SYNC] Umbral alcanzado:', tipo, cola.length);
      setTimeout(() => this._syncAhora(tipo), 500);
    }

    this._actualizarIndicadores();

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

    // Si el modo es manual, no arrancar worker automático
    if (config.modo === 'manual') {
      console.log('[SYNC] Worker manual para', tipo, '- no se autoinicia');
      return;
    }

    // Desfase inicial aleatorio entre 0 e intervaloBase
    const desfase = Math.random() * config.intervaloBase;

    setTimeout(() => {
      this._syncAhora(tipo);
      this._programarSiguienteSync(tipo);
    }, desfase);
  },

  _programarSiguienteSync(tipo) {
    const config = this.CONFIG[tipo];

    // Jitter: -jitterMax a +jitterMax
    const jitter = (Math.random() * 2 - 1) * config.jitterMax;
    const intervalo = config.intervaloBase + jitter;

    this._workers[tipo] = setTimeout(() => {
      this._syncAhora(tipo);
      this._programarSiguienteSync(tipo);
    }, intervalo);
  },

  forzarSync() {
    Object.keys(this.CONFIG).forEach(tipo => {
      if (this.CONFIG[tipo].modo === 'auto') {
        this._syncAhora(tipo);
      }
    });
  },

  // ============================================================
  // SYNC AHORA (worker automático)
  // ============================================================
  async _syncAhora(tipo) {
    if (this._enviando[tipo]) return;

    const config = this.CONFIG[tipo];
    let cola = this._leerCola(tipo);

    if (cola.length === 0) {
      this._actualizarIndicadores();
      return;
    }

    if (!navigator.onLine) {
      this._actualizarIndicadores();
      return;
    }

    this._enviando[tipo] = true;
    this._actualizarIndicadores();

    try {
      const batch = cola.slice(0, config.maxBatch);
      const resultado = await this._enviarBatch(tipo, batch);

      if (resultado.ok) {
        const exitososRaw = resultado.exitosos || [];
        const idsOk = new Set();

        exitososRaw.forEach(e => {
          if (e && e.ok && e.id_local) idsOk.add(e.id_local);
        });

        // Si el backend no devuelve lista, asumimos que todo el batch pasó
        if (exitososRaw.length === 0) {
          batch.forEach(b => idsOk.add(b.id_local));
        }

        const colaActual = this._leerCola(tipo);
        const colaRestante = colaActual.filter(item => !idsOk.has(item.id_local));
        this._escribirCola(tipo, colaRestante);

        // Registrar rechazos individuales
        const fallidos = exitososRaw.filter(e => e && e.ok === false);
        if (fallidos.length > 0) {
          const fallidosIds = new Set(fallidos.map(f => f.id_local));
          const cola2 = this._leerCola(tipo).filter(item => !fallidosIds.has(item.id_local));
          this._escribirCola(tipo, cola2);
          UI.toast(`⚠️ ${fallidos.length} registros rechazados`, 'error', 6000);
        }
      } else {
        // Falló el batch entero: marcar intentos
        batch.forEach(item => {
          const cola2 = this._leerCola(tipo);
          const encontrado = cola2.find(c => c.id_local === item.id_local);
          if (encontrado) {
            encontrado.intentos = (encontrado.intentos || 0) + 1;
            encontrado.ultimoError = resultado.error;
          }
          this._escribirCola(tipo, cola2);
        });

        // Eliminar los que superaron maxIntentos
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
      this._actualizarIndicadores();
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
  // ENVÍO FORZADO (para cierre de mesa, o manual)
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

      if (exitososRaw.length === 0) {
        cola.forEach(item => idsOk.add(item.id_local));
      }

      const exitosos = idsOk.size;
      const errores = cola.length - exitosos;

      const colaRestante = cola.filter(item => !idsOk.has(item.id_local));
      this._escribirCola(tipo, colaRestante);

      this._actualizarIndicadores();

      return { ok: errores === 0, total: cola.length, exitosos, errores };

    } catch (err) {
      console.error('[SYNC] enviarTodoAhora falló:', err.message);
      return { ok: false, total: cola.length, exitosos: 0, errores: cola.length, error: err.message };
    }
  },

  // ============================================================
  // SINCRONIZAR TODO AHORA (botón manual con cooldown 15 seg)
  // ============================================================
  async sincronizarTodoAhora() {
    const ahora = Date.now();
    const ultimoManual = this._ultimoManual || 0;

    if (ahora - ultimoManual < 15000) {
      const restante = Math.ceil((15000 - (ahora - ultimoManual)) / 1000);
      UI.toast(`Esperá ${restante} seg antes de volver a sincronizar`, 'alerta');
      return;
    }

    this._ultimoManual = ahora;
    UI.toast('Sincronizando...', 'info', 2000);

    const tipos = Object.keys(this.CONFIG).filter(t => this.CONFIG[t].modo === 'auto');
    const resultados = {};

    for (const tipo of tipos) {
      resultados[tipo] = await this.enviarTodoAhora(tipo);
    }

    const enviados = Object.values(resultados).reduce((s, r) => s + (r.exitosos || 0), 0);
    const errores = Object.values(resultados).reduce((s, r) => s + (r.errores || 0), 0);

    if (errores === 0 && enviados > 0) {
      UI.toast(`✅ ${enviados} registros sincronizados`, 'exito');
    } else if (errores > 0) {
      UI.toast(`⚠️ ${errores} registros fallaron`, 'alerta', 5000);
    } else {
      UI.toast('Todo sincronizado', 'info');
    }

    this._actualizarIndicadores();
    return resultados;
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
  _actualizarIndicadores() {
    const cont = document.getElementById('sync-indicator');
    if (!cont) return;

    const pendientes = this.contarPendientes();
    const online = navigator.onLine;
    const enviando = Object.keys(this._enviando).some(k => this._enviando[k]);

    if (!online) {
      cont.innerHTML = `<span class="badge badge-error">🔴 Sin conexión${pendientes.total > 0 ? ' · ' + pendientes.total : ''}</span>`;
    } else if (enviando) {
      cont.innerHTML = `<span class="badge badge-info">⏳ Sincronizando...</span>`;
    } else if (pendientes.total === 0) {
      cont.innerHTML = `<span class="badge badge-exito">✅ Sincronizado</span>`;
    } else {
      cont.innerHTML = `<span class="badge badge-alerta">⏳ ${pendientes.total} pendiente${pendientes.total !== 1 ? 's' : ''}</span> <button class="btn btn-secondary btn-sm" id="btn-sync-now">Sincronizar</button>`;
      const btn = document.getElementById('btn-sync-now');
      if (btn && !btn._listener) {
        btn._listener = true;
        btn.addEventListener('click', () => this.sincronizarTodoAhora());
      }
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
