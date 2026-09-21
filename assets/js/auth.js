/* ============================================================
   DIA_D2026 — auth.js
   Autenticación + protección de páginas + UI básica
   ============================================================ */

const AUTH = {

  // Verificar si hay sesión válida
  haySesion() {
    const token = UTILS.obtenerToken();
    if (!token) return false;
    if (UTILS.sesionExpirada()) {
      UTILS.borrarSesion();
      return false;
    }
    return true;
  },

  // Obtener usuario actual
  usuarioActual() {
    return UTILS.obtenerUsuario();
  },

  // Redirigir al login
  irAlLogin() {
    window.location.href = 'index.html';
  },

  // Redirigir al panel según rol
  irAPanel(rol) {
    const panel = CONFIG.PANEL_POR_ROL[rol];
    if (panel) {
      window.location.href = panel;
    } else {
      this.irAlLogin();
    }
  },

  // Cerrar sesión
   async logout() {
    // Verificar si hay pendientes
    if (typeof SYNC !== 'undefined') {
      const pendientes = SYNC.contarPendientes();
      if (pendientes.total > 0) {
        const continuar = confirm(
          `⚠️ Tenés ${pendientes.total} registro${pendientes.total !== 1 ? 's' : ''} pendiente${pendientes.total !== 1 ? 's' : ''} de sincronizar.\n\n` +
          `Si cerrás sesión ahora, se van a intentar enviar automáticamente.\n\n` +
          `¿Cerrar sesión igual?`
        );
        if (!continuar) return;
        // Intentar sincronizar antes de salir
        SYNC.forzarSync();
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    try {
      await API.logout();
    } catch (e) {
      // Ignorar errores al hacer logout
    }

    // Limpiar cache y cola
    if (typeof CACHE !== 'undefined') CACHE.limpiarTodo();
    if (typeof SYNC !== 'undefined') {
      Object.keys(SYNC.CONFIG).forEach(tipo => {
        SYNC._escribirCola(tipo, []);
      });
    }

    UTILS.borrarSesion();
    this.irAlLogin();
  },

  // Proteger una página — verifica sesión y roles permitidos
  // Se llama en cada panel
  async proteger(rolesPermitidos = []) {
    if (!this.haySesion()) {
      this.irAlLogin();
      return null;
    }

    // Verificar sesión con el backend
    let usuario;
    try {
      usuario = await API.me();
    } catch (e) {
      UTILS.borrarSesion();
      this.irAlLogin();
      return null;
    }

    // Verificar rol
    if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(usuario.rol)) {
      UI.toast('No tenés permiso para acceder a esta página', 'error');
      setTimeout(() => this.irAPanel(usuario.rol), 1500);
      return null;
    }

    // Guardar usuario actualizado
    localStorage.setItem(CONFIG.STORAGE.USUARIO, JSON.stringify(usuario));
    return usuario;
  },

  // Renderizar info del usuario en el header
  renderHeaderUsuario(usuario) {
    const contenedor = document.getElementById('header-user');
    if (!contenedor || !usuario) return;

    const inicial = UTILS.iniciales(usuario.nombre_completo);

    contenedor.innerHTML = `
      <div class="header-user-info">
        <div class="header-user-name">${UTILS.escaparHTML(usuario.nombre_completo)}</div>
        <div class="header-user-rol">${UTILS.escaparHTML(usuario.rol)}</div>
      </div>
      <div class="avatar">${inicial}</div>
      <button class="btn btn-ghost btn-icon" id="btn-logout" title="Cerrar sesión" aria-label="Cerrar sesión">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    `;

    document.getElementById('btn-logout').addEventListener('click', () => this.logout());
  },

  // Actualizar nombre del sistema en el header
  renderHeaderLogo() {
    const el = document.getElementById('header-logo');
    if (!el) return;
    el.innerHTML = `
      <img src="assets/img/logo-lista1.png" alt="Logo Lista 1" onerror="this.style.display='none'">
      <div class="logo-text">
        <span class="logo-title">${CONFIG.SISTEMA_NOMBRE}</span>
        <span class="logo-sub">${CONFIG.SISTEMA_SUBTITULO}</span>
      </div>
    `;
  }
};


// ============================================================
// UI — Helpers rápidos (toasts, loaders, modales)
// ============================================================

const UI = {

  // Contenedor de toasts (se crea automáticamente)
  _getToastContainer() {
    let c = document.querySelector('.toast-container');
    if (!c) {
      c = document.createElement('div');
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  },

  toast(mensaje, tipo = 'info', duracion = 3500) {
    const container = this._getToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensaje;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(120%)';
      setTimeout(() => toast.remove(), 300);
    }, duracion);
  },

  loader(mostrar, mensaje = 'Cargando...') {
    let loader = document.getElementById('loader-global');
    if (mostrar) {
      if (!loader) {
        loader = document.createElement('div');
        loader.id = 'loader-global';
        loader.className = 'loader-overlay';
        loader.innerHTML = `<div class="spinner"></div><div class="mensaje">${mensaje}</div>`;
        document.body.appendChild(loader);
      } else {
        loader.querySelector('.mensaje').textContent = mensaje;
      }
    } else {
      if (loader) loader.remove();
    }
  },

  confirmar(mensaje) {
    return window.confirm(mensaje);
  }
};
