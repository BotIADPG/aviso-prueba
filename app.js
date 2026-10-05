// Mi visita · Perfiles LM — página de seguimiento con avisos web.
(function () {
  'use strict';

  var PASOS = [
    { clase: 'folio', nombre: 'Registrado' },
    { clase: 'ingresar', nombre: 'Puede ingresar' },
    { clase: 'facturando', nombre: 'En facturación' },
    { clase: 'papeleria', nombre: 'Papelería lista' }
  ];
  // Qué dice el letrero según el paso. "accion" = el chofer tiene que moverse.
  var LETRERO = {
    0: { titulo: 'Sin visita activa', detalle: 'Cuando registre su llegada en caseta, aquí verá cada paso.', tono: 'quieto' },
    1: { titulo: 'Espere su turno', tono: '' },
    2: { titulo: 'Preséntese en caseta', tono: 'accion' },
    3: { titulo: 'Preparando su papelería', tono: '' },
    4: { titulo: 'Pase por su papelería', tono: 'accion' }
  };
  var VISTAS = ['seguimiento', 'registro', 'iphone', 'negado', 'sin-soporte'];

  var $ = function (id) { return document.getElementById(id); };
  var ultimoPaso = null;

  function mostrar(vista) {
    VISTAS.forEach(function (v) { $('vista-' + v).hidden = v !== vista; });
    $('folio').hidden = vista !== 'seguimiento' || !$('folio').textContent;
  }

  function esIphone() { return /iPhone|iPad|iPod/.test(navigator.userAgent); }
  function enInicio() { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; }
  function soportaAvisos() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }

  function aBytes(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, function (c) { return c.charCodeAt(0); });
  }

  function postJSON(url, cuerpo) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      .then(function (r) { if (!r.ok) throw new Error('El servidor respondió ' + r.status); return r.json(); });
  }

  function horaAhora() {
    return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- Seguimiento ----------
  function pintar(e) {
    var avisos = e.avisos || [];          // vienen del más nuevo al más viejo
    var paso = e.paso || 0;
    var cfg = LETRERO[paso] || LETRERO[0];

    var letrero = $('letrero');
    letrero.className = 'letrero' + (cfg.tono ? ' ' + cfg.tono : '');
    if (ultimoPaso !== null && ultimoPaso !== paso) {
      letrero.classList.add('recien');
    }
    ultimoPaso = paso;
    $('letrero-titulo').textContent = cfg.titulo;
    $('letrero-detalle').textContent = cfg.detalle || (e.ultimo && e.ultimo.texto) || '';
    $('actualizado').textContent = 'Actualizado a las ' + horaAhora();

    // Hora de cada paso = primer aviso de esa clase en la visita.
    var horaDe = {};
    avisos.slice().reverse().forEach(function (a) { if (!horaDe[a.clase]) horaDe[a.clase] = a.hora; });

    var ol = $('pasos');
    ol.textContent = '';
    PASOS.forEach(function (p, i) {
      var n = i + 1;
      var li = document.createElement('li');
      li.className = 'paso' + (n < paso ? ' hecho' : n === paso ? ' actual' + (cfg.tono === 'accion' ? ' accion' : '') : '');
      if (n === paso) li.setAttribute('aria-current', 'step');
      var m = document.createElement('span'); m.className = 'marcador'; m.textContent = n < paso ? '✓' : String(n);
      var nom = document.createElement('span'); nom.className = 'nombre'; nom.textContent = p.nombre;
      var h = document.createElement('span'); h.className = 'hora'; h.textContent = horaDe[p.clase] || '';
      li.appendChild(m); li.appendChild(nom); li.appendChild(h);
      ol.appendChild(li);
    });

    var ul = $('historial');
    ul.textContent = '';
    avisos.forEach(function (a) {
      var li = document.createElement('li');
      var t = document.createElement('time'); t.textContent = a.hora;
      var p = document.createElement('span'); p.textContent = a.texto;
      li.appendChild(t); li.appendChild(p);
      ul.appendChild(li);
    });
    $('historial-vacio').hidden = avisos.length > 0;

    var folio = null;
    avisos.forEach(function (a) { var m = a.clase === 'folio' && /(\d{4,})/.exec(a.texto); if (m && !folio) folio = m[1]; });
    $('folio').textContent = folio ? 'Folio ' + folio : '';
    $('pie-tel').textContent = 'Avisos activos en ···' + (e.tel4 || '');
    mostrar('seguimiento');
  }

  function consultar() {
    return navigator.serviceWorker.ready
      .then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) {
        if (!sub) return null;
        return postJSON(CONFIG.ESTADO, { endpoint: sub.endpoint });
      });
  }

  function refrescar() {
    if (document.visibilityState !== 'visible' || $('vista-seguimiento').hidden) return;
    consultar().then(function (e) { if (e && e.ok) pintar(e); }).catch(function () {
      $('actualizado').textContent = 'Sin conexión. Mostrando lo último que recibimos.';
    });
  }

  // ---------- Registro ----------
  function mostrarError(texto) { var el = $('error'); el.textContent = texto; el.hidden = !texto; }

  function activar(ev) {
    ev.preventDefault();
    mostrarError('');
    var digitos = $('cel').value.replace(/\D/g, '');
    if (digitos.length < 10) { mostrarError('Escriba su celular a 10 dígitos.'); $('cel').focus(); return; }
    var boton = $('boton-activar');
    boton.disabled = true; boton.textContent = 'Activando…';

    Notification.requestPermission()
      .then(function (permiso) {
        if (permiso !== 'granted') { mostrarNegado(); throw null; }
        return navigator.serviceWorker.ready;
      })
      .then(function (reg) {
        return reg.pushManager.getSubscription().then(function (vieja) {
          var opciones = { userVisibleOnly: true, applicationServerKey: aBytes(CONFIG.APP_KEY) };
          return (vieja ? vieja.unsubscribe() : Promise.resolve()).then(function () { return reg.pushManager.subscribe(opciones); });
        });
      })
      .then(function (sub) {
        return postJSON(CONFIG.REGISTRO, { celular: digitos, sub: sub.toJSON(), ua: navigator.userAgent });
      })
      .then(function (r) {
        if (!r.ok) throw new Error(r.error || 'No pudimos activar sus avisos.');
        return consultar();
      })
      .then(function (e) { if (e && e.ok) pintar(e); })
      .catch(function (err) { if (err) mostrarError(err.message || 'No pudimos activar sus avisos. Revise su señal e intente de nuevo.'); })
      .then(function () { boton.disabled = false; boton.textContent = 'Activar avisos'; });
  }

  function mostrarNegado() {
    var pasos = esIphone()
      ? ['Abra Ajustes de su iPhone.', 'Entre a Notificaciones y busque Mi visita.', 'Active Permitir notificaciones y regrese aquí.']
      : ['Toque el candado junto a la dirección de la página.', 'Entre a Permisos o Notificaciones.', 'Elija Permitir y regrese aquí.'];
    var ol = $('pasos-negado'); ol.textContent = '';
    pasos.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ol.appendChild(li); });
    mostrar('negado');
  }

  // ---------- Arranque ----------
  function iniciar() {
    if (esIphone() && !enInicio()) { mostrar('iphone'); return; }
    if (!soportaAvisos()) { mostrar('sin-soporte'); return; }

    navigator.serviceWorker.register('sw.js');
    navigator.serviceWorker.addEventListener('message', function (m) { if (m.data === 'actualizar') refrescar(); });
    $('form-registro').addEventListener('submit', activar);
    $('cambiar').addEventListener('click', function () { mostrar('registro'); $('cel').focus(); });
    $('reintentar').addEventListener('click', function () { mostrar('registro'); });
    document.addEventListener('visibilitychange', refrescar);
    setInterval(refrescar, 60000);

    if (Notification.permission === 'denied') { mostrarNegado(); return; }
    consultar()
      .then(function (e) { if (e && e.ok) pintar(e); else mostrar('registro'); })
      .catch(function () { mostrar('registro'); });
  }

  iniciar();
})();
