/* ============================================================
   DIA_D2026 — api.js
   Cliente para comunicarse con el backend (Apps Script)
   ============================================================ */

const API = {

  // ---------- REQUEST BASE ----------
  async request(accion, datos = {}, opciones = {}) {
    const payload = { accion, ...datos };

    // Agregar token automáticamente (salvo acciones públicas)
    const accionesPublicas = ['login', 'ping', 'version'];
    if (!accionesPublicas.includes(accion)) {
      const token = UTILS.obtenerToken();
      if (!token) {
        throw new Error('No hay sesión activa');
      }
      payload.token = token;
    }

    try {
    const resp = await fetch(CONFIG.API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'data=' + encodeURIComponent(JSON.stringify(payload)),
  redirect: 'follow'
});

      if (!resp.ok) {
        throw new Error('Error HTTP ' + resp.status);
      }

      const data = await resp.json();

      // Si el token expiró → logout automático
      if (!data.ok && data.codigo === 'TOKEN_EXPIRED') {
        UTILS.borrarSesion();
        if (!opciones.silencioso) {
          UI.toast('Sesión expirada. Volviendo al login...', 'alerta');
        }
        setTimeout(() => { window.location.href = 'index.html'; }, 1500);
        throw new Error('Sesión expirada');
      }

      if (!data.ok && data.codigo === 'AUTH_FAIL') {
        UTILS.borrarSesion();
        if (!opciones.silencioso) {
          UI.toast('Sesión inválida', 'error');
        }
        setTimeout(() => { window.location.href = 'index.html'; }, 1500);
        throw new Error(data.error || 'Auth fail');
      }

      if (!data.ok) {
        throw new Error(data.error || 'Error en la petición');
      }

      return data.data;

    } catch (err) {
      // Error de red
      if (err.message.includes('Failed to fetch')) {
        throw new Error('Sin conexión al servidor. Revisá tu internet.');
      }
      throw err;
    }
  },

  // ============================================================
  // MÉTODOS ESPECÍFICOS POR ACCIÓN
  // ============================================================

  // ---------- PÚBLICOS ----------
  ping() {
    return this.request('ping');
  },

  version() {
    return this.request('version');
  },

  login(usuario, credencial) {
    return this.request('login', { usuario, credencial });
  },

  // ---------- SESIÓN ----------
  logout() {
    return this.request('logout');
  },

  me() {
    return this.request('me');
  },

  // ---------- USUARIOS ----------
  listarUsuarios() {
    return this.request('listarUsuarios');
  },

  crearUsuario(datos) {
    return this.request('crearUsuario', datos);
  },

  editarUsuario(id_usuario, cambios) {
    return this.request('editarUsuario', { id_usuario, cambios });
  },

  cambiarPassword(credencial_actual, credencial_nueva) {
    return this.request('cambiarPassword', { credencial_actual, credencial_nueva });
  },

  reasignarUsuario(id_usuario, id_escuela_nueva) {
    return this.request('reasignarUsuario', { id_usuario, id_escuela_nueva });
  },

  // ---------- ESCUELAS ----------
  listarEscuelas() {
    return this.request('listarEscuelas');
  },

  // ---------- ASISTENCIA ----------
  registrarAsistencia(datos) {
    return this.request('registrarAsistencia', datos);
  },

  misAsistencias() {
    return this.request('misAsistencias');
  },

  listarAsistencias() {
    return this.request('listarAsistencias');
  },

  // ---------- ESCRUTINIO ----------
  abrirMesa(id_escuela, numero_mesa) {
    return this.request('abrirMesa', { id_escuela, numero_mesa });
  },

  cerrarMesa(id_apertura) {
    return this.request('cerrarMesa', { id_apertura });
  },

  mesasAbiertas() {
    return this.request('mesasAbiertas');
  },

  cargarVoto(datos) {
    return this.request('cargarVoto', datos);
  },

  listarVotos() {
    return this.request('listarVotos');
  },

  // ---------- VOCA DE URNA ----------
  registrarVoca(datos) {
    return this.request('registrarVoca', datos);
  },

  misVocas() {
    return this.request('misVocas');
  },

  // ---------- CHOFER ----------
  registrarViaje(datos) {
    return this.request('registrarViaje', datos);
  },

  misViajes() {
    return this.request('misViajes');
  },

  // ---------- LISTAS ----------
  listarListas() {
    return this.request('listarListas');
  },

  // ---------- TOTALES ----------
  totalesGlobales() {
    return this.request('totalesGlobales');
  },

  totalesPorColegio() {
    return this.request('totalesPorColegio');
  },

  rankingPunteros() {
    return this.request('rankingPunteros');
  },

  // ---------- CONTROL DEL DÍA ----------
  abrirDia() {
    return this.request('abrirDia');
  },

  cerrarDia() {
    return this.request('cerrarDia');
  },

  estadoDia() {
    return this.request('estadoDia');
  },

  // ---------- AUDITORÍA ----------
  verAuditoria(limite = 50) {
    return this.request('verAuditoria', { limite });
  }
};
