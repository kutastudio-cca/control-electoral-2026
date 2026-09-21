/* ============================================================
   DIA_D2026 — cache.js
   Sistema de cache con expiración configurable
   ============================================================ */

const CACHE = {

  // Duración del cache por defecto: 10 minutos
  DURACION_DEFAULT_MS: 10 * 60 * 1000,

  // Prefijo de las claves en localStorage
  PREFIX: 'dia_cache_',

  /**
   * Guarda un valor en cache con expiración
   * @param {string} clave - Nombre del cache
   * @param {any} valor - Valor a guardar
   * @param {number} duracionMs - Duración en ms (opcional)
   */
  set(clave, valor, duracionMs) {
    try {
      const entrada = {
        valor: valor,
        expira: Date.now() + (duracionMs || this.DURACION_DEFAULT_MS),
        creado: Date.now()
      };
      localStorage.setItem(this.PREFIX + clave, JSON.stringify(entrada));
    } catch (e) {
      console.warn('Cache.set falló:', clave, e.message);
    }
  },

  /**
   * Obtiene un valor del cache
   * Devuelve null si expiró o no existe
   */
  get(clave) {
    try {
      const raw = localStorage.getItem(this.PREFIX + clave);
      if (!raw) return null;
      const entrada = JSON.parse(raw);
      if (!entrada || !entrada.expira) return null;
      if (Date.now() > entrada.expira) {
        localStorage.removeItem(this.PREFIX + clave);
        return null;
      }
      return entrada.valor;
    } catch (e) {
      return null;
    }
  },

  /**
   * Fuerza la eliminación de un cache
   */
  invalidar(clave) {
    try {
      localStorage.removeItem(this.PREFIX + clave);
    } catch (e) {}
  },

  /**
   * Limpia TODO el cache
   */
  limpiarTodo() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(k => {
        if (k.startsWith(this.PREFIX)) localStorage.removeItem(k);
      });
    } catch (e) {}
  },

  /**
   * Limpia entradas expiradas (útil al inicio)
   */
  limpiarExpirados() {
    try {
      const keys = Object.keys(localStorage);
      const ahora = Date.now();
      keys.forEach(k => {
        if (k.startsWith(this.PREFIX)) {
          try {
            const entrada = JSON.parse(localStorage.getItem(k));
            if (!entrada || !entrada.expira || ahora > entrada.expira) {
              localStorage.removeItem(k);
            }
          } catch (e) {
            localStorage.removeItem(k);
          }
        }
      });
    } catch (e) {}
  },

  /**
   * Estadísticas de uso (debug)
   */
  stats() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.PREFIX));
    const detalles = keys.map(k => {
      try {
        const e = JSON.parse(localStorage.getItem(k));
        const tamano = (localStorage.getItem(k) || '').length;
        return {
          clave: k.replace(this.PREFIX, ''),
          tamano: tamano + ' bytes',
          expiraEn: e && e.expira ? Math.round((e.expira - Date.now()) / 1000) + 's' : 'N/A'
        };
      } catch (err) {
        return { clave: k, error: true };
      }
    });
    return detalles;
  }
};


// ============================================================
// WRAPPERS: acceso a datos con cache automático
// ============================================================

const DATA = {

  /**
   * Obtiene las escuelas (cache 30 min)
   */
  async escuelas(forzar) {
    if (!forzar) {
      const cache = CACHE.get('escuelas');
      if (cache) return cache;
    }
    const data = await API.listarEscuelas();
    CACHE.set('escuelas', data, 30 * 60 * 1000); // 30 min
    return data;
  },

  /**
   * Obtiene las listas/candidatos (cache 30 min)
   */
  async listas(forzar) {
    if (!forzar) {
      const cache = CACHE.get('listas');
      if (cache) return cache;
    }
    const data = await API.listarListas();
    CACHE.set('listas', data, 30 * 60 * 1000);
    return data;
  },

  /**
   * Obtiene estado del sistema (cache 30 seg)
   */
  async estadoSistema(forzar) {
    if (!forzar) {
      const cache = CACHE.get('estadoSistema');
      if (cache) return cache;
    }
    const data = await API.request('estadoSistema');
    CACHE.set('estadoSistema', data, 30 * 1000); // 30 seg
    return data;
  },

  /**
   * Invalida el cache de un tipo
   */
  invalidar(tipo) {
    CACHE.invalidar(tipo);
  },

  /**
   * Invalida TODO (útil al logout)
   */
  invalidarTodo() {
    CACHE.limpiarTodo();
  }
};
