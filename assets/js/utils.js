/* ============================================================
   DIA_D2026 — utils.js
   Helpers generales
   ============================================================ */

const UTILS = {

  // ---------- FECHAS ----------
  formatearFecha(fecha) {
    if (!fecha) return '—';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  formatearHora(fecha) {
    if (!fecha) return '—';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
  },

  formatearFechaHora(fecha) {
    if (!fecha) return '—';
    return `${this.formatearFecha(fecha)} ${this.formatearHora(fecha)}`;
  },

  horaActual() {
    return new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
  },

  // ---------- NÚMEROS ----------
  formatearNumero(n) {
    const num = Number(n);
    if (isNaN(num)) return '0';
    return num.toLocaleString('es-PY');
  },

  // ---------- TEXTO ----------
  iniciales(nombre) {
    if (!nombre) return '?';
    const partes = String(nombre).trim().split(/\s+/);
    if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
    return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
  },

  capitalizar(texto) {
    if (!texto) return '';
    return String(texto).charAt(0).toUpperCase() + String(texto).slice(1).toLowerCase();
  },

  // ---------- VALIDACIONES ----------
  soloNumeros(valor) {
    return String(valor || '').replace(/\D/g, '');
  },

  esVacio(valor) {
    return valor === null || valor === undefined || String(valor).trim() === '';
  },

  // ---------- DOM ----------
  $(selector, contexto = document) {
    return contexto.querySelector(selector);
  },

  $$(selector, contexto = document) {
    return Array.from(contexto.querySelectorAll(selector));
  },

  crearElemento(tag, atributos = {}, hijos = []) {
    const el = document.createElement(tag);
    Object.entries(atributos).forEach(([k, v]) => {
      if (k === 'className') el.className = v;
      else if (k === 'textContent') el.textContent = v;
      else if (k === 'innerHTML') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v);
    });
    hijos.forEach(h => {
      if (typeof h === 'string') el.appendChild(document.createTextNode(h));
      else if (h instanceof Node) el.appendChild(h);
    });
    return el;
  },

  // ---------- SEGURIDAD ----------
  escaparHTML(texto) {
    const div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  },

  // ---------- LOCAL STORAGE ----------
  guardarSesion(token, usuario, expira) {
    localStorage.setItem(CONFIG.STORAGE.TOKEN, token);
    localStorage.setItem(CONFIG.STORAGE.USUARIO, JSON.stringify(usuario));
    localStorage.setItem(CONFIG.STORAGE.EXPIRA, expira);
  },

  obtenerToken() {
    return localStorage.getItem(CONFIG.STORAGE.TOKEN);
  },

  obtenerUsuario() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.STORAGE.USUARIO) || 'null');
    } catch (e) {
      return null;
    }
  },

  borrarSesion() {
    localStorage.removeItem(CONFIG.STORAGE.TOKEN);
    localStorage.removeItem(CONFIG.STORAGE.USUARIO);
    localStorage.removeItem(CONFIG.STORAGE.EXPIRA);
  },

  sesionExpirada() {
    const expira = localStorage.getItem(CONFIG.STORAGE.EXPIRA);
    if (!expira) return true;
    return new Date(expira) < new Date();
  }
};
