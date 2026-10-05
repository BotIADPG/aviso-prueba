// Mi visita · Perfiles LM — página de seguimiento con avisos web.
(function () {
  'use strict';

  // Los 4 pasos que SAP nos avisa. El texto explica qué significa cada uno (sale de los propios avisos de SAP).
  var PASOS = [
    { clase: 'folio', nombre: 'Registrado', texto: 'Su llegada quedó registrada. Espere el aviso para ingresar.' },
    { clase: 'ingresar', nombre: 'Puede ingresar', texto: 'Repórtese con su unidad en caseta para ingresar a planta.' },
    { clase: 'facturando', nombre: 'En facturación', texto: 'Recibimos su información y estamos preparando su papelería.' },
    { clase: 'papeleria', nombre: 'Papelería lista', texto: 'Pase al área de Facturación por su papelería.' }
  ];
  var ICONOS = {
    reloj: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    alerta: 'M12 9v4M12 17h.01M10.3 3.9 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    bandeja: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
    palomita: 'M5 12.5l4.5 4.5L19 7.5'
  };
  // Qué dice la tarjeta de acción según el paso. "mueva" = el chofer tiene que moverse ahora.
  var ACCION = {
    0: { titulo: 'Sin visita activa', detalle: 'Cuando registre su llegada en caseta, aquí verá cada paso.', tono: 'quieta', icono: 'bandeja' },
    1: { titulo: 'Espere su turno', tono: '', icono: 'reloj' },
    2: { titulo: '¡Preséntese en caseta!', tono: 'mueva', icono: 'alerta' },
    3: { titulo: 'Preparando su papelería', tono: '', icono: 'reloj' },
    4: { titulo: '¡Pase por su papelería!', tono: 'mueva', icono: 'alerta' }
  };
  var VISTAS = ['seguimiento', 'registro', 'iphone', 'negado', 'sin-soporte'];
  var SVG = 'http://www.w3.org/2000/svg';

  var $ = function (id) { return document.getElementById(id); };
  var ultimoPaso = null;

  function mostrar(vista) {
    VISTAS.forEach(function (v) { $('vista-' + v).hidden = v !== vista; });
    var siguiendo = vista === 'seguimiento';
    $('folio').hidden = !siguiendo || !$('folio').textContent;
    $('conexion').hidden = !siguiendo;
  }

  function esIphone() { return /iPhone|iPad|iPod/.test(navigator.userAgent); }
  function enInicio() { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; }
  function soportaAvisos() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }

  function aBytes(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, function (c) { return c.charCodeAt(0); });
  }

  function mismaClave(sub, clave) {
    var k = sub.options && sub.options.applicationServerKey;
    if (!k) return false;
    var a = new Uint8Array(k);
    if (a.length !== clave.length) return false;
    for (var i = 0; i < a.length; i++) { if (a[i] !== clave[i]) return false; }
    return true;
  }

  function postJSON(url, cuerpo) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      .then(function (r) { if (!r.ok) throw new Error('El servidor respondió ' + r.status); return r.json(); });
  }

  function horaAhora() { return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); }

  function icono(nombre) {
    var s = document.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(SVG, 'path'); p.setAttribute('d', ICONOS[nombre]); s.appendChild(p);
    return s;
  }

  function el(tag, clase, texto) {
    var e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e;
  }

  function conexion(ok) {
    $('conexion').classList.toggle('sin-red', !ok);
    $('conexion-texto').textContent = ok ? 'Actualizado a las ' + horaAhora() : 'Sin señal. Mostrando lo último que recibimos.';
  }

  // ---------- Seguimiento ----------
  function pintar(e) {
    var avisos = e.avisos || [];          // del más nuevo al más viejo
    var paso = e.paso || 0;
    var cfg = ACCION[paso] || ACCION[0];

    var tarjeta = $('accion');
    tarjeta.className = 'accion' + (cfg.tono ? ' ' + cfg.tono : '');
    if (ultimoPaso !== null && ultimoPaso !== paso) { void tarjeta.offsetWidth; tarjeta.classList.add('llega'); }
    ultimoPaso = paso;
    $('accion-icono-trazo').setAttribute('d', ICONOS[cfg.icono]);
    $('accion-paso').textContent = paso ? 'Paso ' + paso + ' de ' + PASOS.length : 'Sin visita';
    $('accion-titulo').textContent = cfg.titulo;
    $('accion-detalle').textContent = cfg.detalle || (e.ultimo && e.ultimo.texto) || '';
    conexion(true);

    // Hora de cada paso = primer aviso de esa clase en la visita.
    var horaDe = {};
    avisos.slice().reverse().forEach(function (a) { if (!horaDe[a.clase]) horaDe[a.clase] = a.hora; });

    var ol = $('pasos'); ol.textContent = '';
    PASOS.forEach(function (p, i) {
      var n = i + 1;
      var estado = n < paso ? 'hecho' : n === paso ? 'actual' : 'pendiente';
      var li = el('li', 'tramo ' + estado);
      if (estado === 'actual') li.setAttribute('aria-current', 'step');
      var m = el('span', 'marcador');
      if (estado === 'hecho') m.appendChild(icono('palomita')); else m.textContent = String(n);
      var cuerpo = el('div', 'tramo-cuerpo');
      var fila = el('div', 'tramo-fila');
      fila.appendChild(el('span', 'tramo-nombre', p.nombre));
      fila.appendChild(el('span', 'tramo-hora', horaDe[p.clase] || ''));
      cuerpo.appendChild(fila);
      // Texto del paso: los cumplidos, el actual y una pista del siguiente (solo si ya hay visita).
      if (estado !== 'pendiente' || (paso > 0 && n === paso + 1)) cuerpo.appendChild(el('p', 'tramo-texto', p.texto));
      li.appendChild(m); li.appendChild(cuerpo);
      ol.appendChild(li);
    });

    var ul = $('historial'); ul.textContent = '';
    avisos.forEach(function (a) {
      var li = el('li');
      li.appendChild(el('time', null, a.hora));
      li.appendChild(el('span', null, a.texto));
      ul.appendChild(li);
    });
    $('historial-vacio').hidden = avisos.length > 0;
    $('contador').textContent = avisos.length === 1 ? '1 aviso' : avisos.length + ' avisos';

    var folio = null;
    avisos.forEach(function (a) { var m = a.clase === 'folio' && /(\d{4,})/.exec(a.texto); if (m && !folio) folio = m[1]; });
    $('folio').textContent = folio ? 'Folio ' + folio : '';
    $('pie-tel').textContent = 'Avisos activos en ···' + (e.tel4 || '');
    mostrar('seguimiento');
  }

  function consultar() {
    return navigator.serviceWorker.ready
      .then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) { return sub ? postJSON(CONFIG.ESTADO, { endpoint: sub.endpoint }) : null; });
  }

  function refrescar() {
    if (document.visibilityState !== 'visible' || $('vista-seguimiento').hidden) return;
    consultar().then(function (e) { if (e && e.ok) pintar(e); }).catch(function () { conexion(false); });
  }

  // ---------- Registro ----------
  function mostrarError(texto) { var e = $('error'); e.textContent = texto; e.hidden = !texto; }

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
        // Reusar la suscripción si es de nuestra llave: cada suscripción nueva es otra dirección y la vieja quedaría activa.
        return reg.pushManager.getSubscription().then(function (vieja) {
          var clave = aBytes(CONFIG.APP_KEY);
          if (vieja && mismaClave(vieja, clave)) return { sub: vieja, anterior: '' };
          var opciones = { userVisibleOnly: true, applicationServerKey: clave };
          return (vieja ? vieja.unsubscribe() : Promise.resolve())
            .then(function () { return reg.pushManager.subscribe(opciones); })
            .then(function (sub) { return { sub: sub, anterior: vieja ? vieja.endpoint : '' }; });
        });
      })
      .then(function (r) {
        return postJSON(CONFIG.REGISTRO, { celular: digitos, sub: r.sub.toJSON(), anterior: r.anterior, ua: navigator.userAgent });
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
    pasos.forEach(function (t) { ol.appendChild(el('li', null, t)); });
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
    $('accion').addEventListener('animationend', function () { $('accion').classList.remove('llega'); });
    document.addEventListener('visibilitychange', refrescar);
    setInterval(refrescar, 60000);

    if (Notification.permission === 'denied') { mostrarNegado(); return; }
    consultar()
      .then(function (e) { if (e && e.ok) pintar(e); else mostrar('registro'); })
      .catch(function () { mostrar('registro'); });
  }

  iniciar();
})();
