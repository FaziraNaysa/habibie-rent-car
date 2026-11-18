'use strict';
/* Frontend Habibie Rent Car: semua data dan aturan bisnis berasal dari API (server). */
var $ = function (s, r) { return (r || document).querySelector(s); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var rp = function (n) { return 'Rp' + Math.round(n || 0).toLocaleString('id-ID'); };
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
var BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var pad = function (n) { return String(n).padStart(2, '0'); };
var T = function (s) { return s ? String(s).replace(' ', 'T').slice(0, 16) : ''; };
var D = function (s) { return new Date(T(s)); };
var fd = function (s) { var d = D(s); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + '.' + pad(d.getMinutes()) + ' WIB'; };
var fs = function (s) { var d = s instanceof Date ? s : D(s); return d.getDate() + ' ' + MON[d.getMonth()]; };
var dt = function (x) { var d = D(x); return fs(x) + ' ' + d.getFullYear() + '<div class="mu">' + pad(d.getHours()) + '.' + pad(d.getMinutes()) + ' WIB</div>'; };
var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
var HOUR = 36e5, DAY = 864e5;
var days = function (s, e) { return Math.max(1, Math.ceil((D(e) - D(s)) / DAY)); };
var CLS = { 'Menunggu DP': 'W', 'Dibooking': 'D', 'Disewa': 'G', 'Selesai': 'X', 'Dibatalkan': 'R' };
var badge = function (t, c) { return '<span class="b ' + (c || CLS[t]) + '">' + esc(t) + '</span>'; };
var labelOf = function (t, inner) { return '<label>' + t + inner + '</label>'; };
var alertBox = function (m, c) { return '<div class="al ' + (c || 'R') + '" role="alert">' + m + '</div>'; };

/* ===== State & API ===== */
var token = null, user = null, units = [], bookings = [], servis = [], nonaktif = [], cur = null, kres = null, kerr = '', lap = null, rid = 0;
var q = null, draft = null, wkStart = null, view = 'cal', jf = '', rep = null, pick = { ring: 1, pel: 1, uni: 1, bok: 1 };
try { token = sessionStorage.getItem('hrc.token'); user = JSON.parse(sessionStorage.getItem('hrc.user')); } catch (e) { }
function setSession(t, u) {
  token = t; user = u;
  try { if (t) { sessionStorage.setItem('hrc.token', t); sessionStorage.setItem('hrc.user', JSON.stringify(u)); } else { sessionStorage.removeItem('hrc.token'); sessionStorage.removeItem('hrc.user'); } } catch (e) { }
}
async function api(method, url, body) {
  var r = await fetch('/api' + url, { method: method, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Requested-With': 'HabibieRentCar' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  var d = {}; try { d = await r.json(); } catch (e) { }
  if (r.status === 401 && token && url.indexOf('/auth/login') !== 0) { setSession(null); location.hash = '#login'; throw new Error(d.pesan || 'Sesi berakhir.'); }
  if (!r.ok) { var e = new Error(d.pesan || 'Terjadi kesalahan pada server.'); e.status = r.status; throw e; }
  return d;
}
var mapB = function (p) { p.mulai = T(p.mulai); p.selesai = T(p.selesai); return p; };
async function refresh() {
  var r = await Promise.all([api('GET', '/unit'), api('GET', '/pemesanan'), api('GET', '/servis')]);
  units = r[0]; bookings = r[1].map(mapB); servis = r[2].map(function (v) { v.mulai = T(v.mulai); v.selesai = T(v.selesai); return v; });
}
var unitById = function (id) { return units.find(function (u) { return u.id === +id; }); };
var unitName = function (b) { return b.rekanan_nama ? b.rekanan_unit + ' (rekanan)' : (b.unit_nama || '?'); };
function toast(m) { var t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3600); }
var curId = function () { return location.hash.split('/')[1] || ''; };

/* ===== Kerangka ===== */
var NAV = [['ketersediaan', 'car', 'Ketersediaan'], ['jadwal', 'cal', 'Jadwal'], ['booking', 'doc', 'Booking'], ['laporan', 'coin', 'Laporan'], ['servis', 'wrench', 'Servis unit'], ['login', 'out', 'Keluar']];
function shell(curNav, body) {
  return '<div class="shell"><nav class="side" aria-label="Menu utama"><div class="brand">' + car(30) + 'Habibie Rent Car</div>' +
    NAV.map(function (n, i) {
      return (i === NAV.length - 1 ? '<div class="sp"></div>' : '') + '<a href="#' + n[0] + '"' + (n[0] === curNav ? ' class="on" aria-current="page"' : '') + (n[0] === 'login' ? ' data-act="logout"' : '') + '><span>' + gi(n[1], 26) + '</span>' + n[2] + '</a>';
    }).join('') + '</nav><main>' + body + '</main></div>';
}

/* ===== Login ===== */
function loginView() {
  return '<div class="lw" style="background-image:url(assets/hero.jpg)"><div class="lt"><div class="brand" style="margin:0">' + car(34) + 'Habibie Rent Car</div>' +
    '<h1>Sistem Informasi Internal Pengelolaan Booking dan Ketersediaan Unit pada Habibie Rent Car</h1><p>Cek ketersediaan unit, atur jadwal booking, catat pembayaran, dan lihat laporan Habibie Rent Car.</p></div>' +
    '<div class="lcard"><form id="lf" novalidate><div><h1>Masuk ke akun Anda</h1><div class="mu">Gunakan akun tim Habibie Rent Car.</div></div>' +
    labelOf('Email atau username', '<input id="em" placeholder="Masukkan email atau username" autocomplete="username" autofocus>') +
    labelOf('Kata sandi', '<span class="fi"><input id="pw" type="password" placeholder="Masukkan kata sandi" autocomplete="current-password"><button type="button" data-act="eye" aria-label="Tampilkan kata sandi">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></span>') +
    '<div id="er" role="alert"></div><button class="btn" style="min-height:48px">Masuk</button><div class="mu" style="text-align:center">Akses khusus tim Habibie Rent Car.</div></form></div></div>';
}
async function doLogin() {
  try {
    var r = await api('POST', '/auth/login', { username: $('#em').value.trim(), password: $('#pw').value });
    setSession(r.token, r.pengguna); location.hash = '#ketersediaan';
  } catch (e) { $('#er').innerHTML = alertBox(esc(e.message)); }
}

/* ===== Ketersediaan ===== */
function ketView() {
  var err = D(q.e) <= D(q.s), free = 0, held = [];
  var cards = err || !kres ? '' : kres.map(function (u) {
    var a = u.alasan, ok = u.tersedia; if (ok) free++;
    var tahan = a && a.jenis.indexOf('Ditahan') === 0; if (tahan) held.push(a.kode);
    return '<div class="card' + (ok ? '' : ' ugrey') + '"><div style="display:flex;justify-content:space-between;align-items:center"><b class="ib">' + gi('car', 28) + esc(u.nama) + '</b>' +
      badge(ok ? 'Tersedia' : a.jenis === 'Servis' ? 'Servis' : tahan ? 'Ditahan' : a.jenis, ok ? 'G' : a.jenis === 'Servis' ? 'X' : tahan ? 'W' : 'D') + '</div>' +
      '<div class="mu">' + u.transmisi + '</div><div style="margin:6px 0"><b>' + rp(u.tarif_harian) + '</b>/hari ' + (u.dengan_driver ? '<span class="b D">Termasuk driver</span>' : '') + '</div>' +
      '<div class="bar" style="margin-top:8px">' + (ok ? '<button class="btn" data-act="buat" data-u="' + u.id + '">Buat booking</button>' : '<div class="mu">Tidak bebas: ' + (a.kode ? esc(a.kode) : 'Servis') + '</div>') +
      '<button class="btn o" data-act="ue" data-u="' + u.id + '" aria-label="Ubah unit ' + esc(u.nama) + '">Edit</button></div></div>';
  }).join('');
  var opt = function (list, c) { return ['<option value="">Semua</option>'].concat(list.map(function (x) { return '<option' + (x === c ? ' selected' : '') + '>' + x + '</option>'; })).join(''); };
  return '<div class="bar" style="justify-content:space-between;align-items:flex-start"><div><h1>Ketersediaan unit</h1><div class="mu">Cek unit bebas pada periode sewa</div></div><button class="btn" data-act="ut">+ Tambah unit</button></div><div class="card" style="margin-top:14px"><div class="g2">' +
    labelOf('Ambil', '<input type="datetime-local" step="1800" id="ks" value="' + q.s + '">') + labelOf('Kembali', '<input type="datetime-local" step="1800" id="ke" value="' + q.e + '">') +
    labelOf('Transmisi', '<select id="kx">' + opt(['Manual', 'Matic'], q.trans) + '</select>') + '</div><div class="bar"><button class="btn" data-act="cek">Cek ketersediaan</button></div></div>' +
    (err ? alertBox('Waktu kembali harus setelah waktu ambil.') : '') + (kerr ? alertBox(esc(kerr)) : '') +
    (held.length ? '<div class="al W ib">' + gi('warn', 24) + 'Menunggu DP menahan unit pada periode ini: ' + held.map(esc).join(', ') + '.</div>' : '') +
    '<div class="grid">' + cards + '</div>' +
    (!err && kres && !free ? '<div class="al W">Tidak ada unit tersedia pada periode ini. <button class="btn o" data-act="buat" data-rk="1">' + gi('pair', 20) + ' Unit rekanan</button></div>' : '') +
    nonaktifList() + '<div id="md"></div>';
}

/* ===== Kelola unit (tambah, ubah, nonaktifkan) ===== */
function nonaktifList() {
  if (!nonaktif.length) return '';
  return '<details style="margin-top:16px"><summary class="mu" style="cursor:pointer">Unit nonaktif (' + nonaktif.length + ')</summary><div class="card" style="margin-top:8px">' +
    nonaktif.map(function (u) {
      return '<div class="row"><span>' + esc(u.nama) + ' · ' + u.transmisi + (u.plat ? ' · ' + esc(u.plat) : '') + '</span><span class="bar"><button class="btn o" data-act="ue" data-u="' + u.id + '">Edit</button><button class="btn" data-act="uaktif" data-id="' + u.id + '">Aktifkan</button></span></div>';
    }).join('') + '</div></details>';
}
function unitForm(u) {
  var v = u || { nama: '', plat: '', transmisi: 'Manual', tarif_harian: '', dengan_driver: 0 };
  modal('uf', u ? 'Ubah unit' : 'Tambah unit',
    '<div class="g2">' + labelOf('Nama unit', '<input id="un" maxlength="100" value="' + esc(v.nama) + '" placeholder="Contoh: Avanza Putih">') +
    labelOf('Plat nomor (opsional)', '<input id="up" maxlength="20" value="' + esc(v.plat) + '" placeholder="BA 1234 XX" autocapitalize="characters">') +
    labelOf('Transmisi', '<select id="ut">' + ['Manual', 'Matic'].map(function (x) { return '<option' + (x === v.transmisi ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>') +
    labelOf('Tarif per hari (Rp)', '<input id="ur" type="number" min="1" inputmode="numeric" value="' + esc(v.tarif_harian) + '" placeholder="Contoh: 300000">') +
    labelOf('Termasuk driver', '<input type="checkbox" id="ud"' + (v.dengan_driver ? ' checked' : '') + '>') + '</div>' +
    (u ? '<div class="mu" style="margin-top:8px">Perubahan tarif hanya berlaku untuk booking baru. Booking yang sudah ada tetap memakai tarif lamanya.</div>' : ''),
    '<button class="btn" data-act="usave"' + (u ? ' data-id="' + u.id + '"' : '') + '>Simpan</button>' +
    (u && u.aktif ? '<button class="btn d" data-act="unon" data-id="' + u.id + '">Nonaktifkan</button>' : ''));
}

/* ===== Jadwal ===== */
function jadView() {
  if (!wkStart) { wkStart = new Date(); wkStart.setHours(0, 0, 0, 0); }
  var ds = []; for (var i = 0; i < 7; i++) ds.push(new Date(+wkStart + i * DAY));
  var end = new Date(+wkStart + 7 * DAY), inWin = function (s, e) { return D(s) < end && D(e) > wkStart; };
  var L = bookings.filter(function (b) { return b.status !== 'Dibatalkan'; });
  var item = function (b) { return { k: 'b', id: b.id, kode: b.kode, s: b.mulai, e: b.selesai, st: b.status }; };
  var rows = units.filter(function (u) { return !jf || String(u.id) === jf; }).map(function (u) {
    return { name: u.nama, items: L.filter(function (b) { return b.unit_id === u.id; }).map(item).concat(servis.filter(function (v) { return v.unit_id === u.id; }).map(function (v) { return { k: 's', s: v.mulai, e: v.selesai }; })) };
  });
  if (!jf && L.some(function (b) { return b.rekanan_nama; })) rows.push({ name: 'Rekanan', items: L.filter(function (b) { return b.rekanan_nama; }).map(item) });
  var di = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return Math.round((x - wkStart) / DAY); };
  var rowHtml = rows.map(function (r) {
    var its = r.items.filter(function (x) { return inWin(x.s, x.e); }).sort(function (a, b) { return D(a.s) - D(b.s); }), lanes = [];
    var html = its.map(function (x) {
      var a = Math.max(0, di(x.s)), eD = D(x.e), b = Math.min(6, di(x.e) - (eD.getHours() + eD.getMinutes() === 0 ? 1 : 0)); if (b < a) b = a;
      var l = lanes.findIndex(function (last) { return last < a; }); if (l < 0) { l = lanes.length; lanes.push(-1); } lanes[l] = b;
      var c = x.k === 's' ? 'X' : CLS[x.st], txt = x.k === 's' ? 'Servis' : x.kode.slice(-3) + ' · ' + x.st, tag = x.k === 'b' ? 'a href="#detail/' + x.id + '"' : 'span';
      return '<' + tag + ' class="blk ' + c + '" style="grid-column:' + (a + 1) + '/' + (b + 2) + ';grid-row:' + (l + 1) + '">' + esc(txt) + '</' + (x.k === 'b' ? 'a' : 'span') + '>';
    }).join('');
    return '<div class="cr rw"><div class="hd">' + esc(r.name) + '</div><div class="lanes">' + html + '</div></div>';
  }).join('');
  var body = view === 'cal'
    ? '<div class="card cal"><div class="cr" style="border:0;color:var(--mu)"><div></div>' + ds.map(function (d) { return '<div style="text-align:center">' + d.getDate() + ' ' + MON[d.getMonth()] + '</div>'; }).join('') + '</div>' + rowHtml + '</div><div class="bar">' + ['Menunggu DP', 'Dibooking', 'Disewa', 'Selesai'].map(function (t) { return badge(t); }).join('') + '</div>'
    : '<div class="card" style="overflow-x:auto"><table><tr><th>Kode</th><th>Pelanggan</th><th>Unit</th><th>Periode</th><th>Status</th><th>Penginput</th></tr>' +
      (bookings.filter(function (b) { return !jf || String(b.unit_id) === jf; }).map(function (b) {
        return '<tr class="k" data-go="detail/' + b.id + '"><td><a href="#detail/' + b.id + '"><b>' + b.kode + '</b></a></td><td>' + esc(b.nama_pelanggan) + '</td><td>' + esc(unitName(b)) + '</td><td>' + fs(b.mulai) + ' – ' + fs(b.selesai) + '</td><td>' + badge(b.status) + '</td><td>' + esc(b.dibuat_oleh_nama) + '</td></tr>';
      }).join('') || '<tr><td colspan="6" class="mu">Belum ada booking.</td></tr>') + '</table></div>';
  return '<h1>Jadwal booking</h1><div class="bar"><div class="tab"><button class="' + (view === 'cal' ? 'on' : '') + '" data-act="view" data-v="cal">' + gi('cal', 20) + ' Kalender</button><button class="' + (view === 'list' ? 'on' : '') + '" data-act="view" data-v="list">' + gi('doc', 20) + ' Daftar</button></div>' +
    '<label class="jfilter">Filter unit<select id="jf"><option value="">Semua unit</option>' + units.map(function (u) { return '<option value="' + u.id + '"' + (jf === String(u.id) ? ' selected' : '') + '>' + esc(u.nama) + '</option>'; }).join('') + '</select></label></div>' +
    (view === 'cal' ? '<div class="wk bar"><button class="btn o" data-act="wk" data-d="-7" aria-label="Minggu sebelumnya">‹</button><b>' + fs(ds[0]) + ' – ' + fs(ds[6]) + ' ' + ds[6].getFullYear() + '</b><button class="btn o" data-act="wk" data-d="7" aria-label="Minggu berikutnya">›</button><button class="btn o" data-act="wk" data-d="0">Hari ini</button></div>' : '') + body;
}

/* ===== Form booking ===== */
function newDraft(o) {
  var t = new Date(); t.setHours(8, 0, 0, 0);
  return Object.assign({ name: '', wa: '', rent: 'Harian', so: 'WhatsApp', rk: false, unitId: units[0] ? units[0].id : '', s: iso(t), e: iso(new Date(+t + DAY)), partner: '', runit: '', cost: '', price: '', driver: false, g: '', bbm: '', kondisi: '', note: '', paid: '' }, o || {});
}
function bookView() {
  var d = draft, u = unitById(d.unitId);
  var dis = '';
  var drv = d.rk ? '' : (u && u.dengan_driver ? labelOf('Driver', '<input value="Ya, sudah termasuk tarif" disabled>') : labelOf('Pakai driver', '<select id="fd"' + dis + '><option value="0">Tidak</option><option value="1"' + (d.driver ? ' selected' : '') + '>Ya</option></select>'));
  var src = d.rk
    ? labelOf('Nama rekanan', '<input id="fpn" value="' + esc(d.partner) + '">') + labelOf('Unit / plat', '<input id="fru" placeholder="Isian bebas" value="' + esc(d.runit) + '">') +
      labelOf('Biaya yang dibayar ke rekanan (Rp)', '<input id="fb" type="number" min="0" value="' + esc(d.cost) + '">') + labelOf('Harga yang ditagih ke pelanggan (Rp)', '<input id="fh" type="number" min="0" value="' + esc(d.price) + '">')
    : labelOf('Unit', '<select id="fu"' + dis + '>' + units.map(function (x) { return '<option value="' + x.id + '"' + (x.id === +d.unitId ? ' selected' : '') + '>' + esc(x.nama) + '</option>'; }).join('') + '</select>') + drv;
  var opt = function (list, c) { return list.map(function (x) { return '<option' + (x === c ? ' selected' : '') + '>' + x + '</option>'; }).join(''); };
  return '<h1>Booking baru</h1><div id="ban"></div><div class="card" style="margin-top:14px"><div class="g2">' +
    labelOf('Nama pelanggan', '<input id="fn" value="' + esc(d.name) + '">') + labelOf('Nomor WhatsApp', '<input id="fw" type="tel" placeholder="08xx" value="' + esc(d.wa) + '">') +
    labelOf('Jenis sewa', '<select id="fj">' + opt(['Harian', 'Kontrak'], d.rent) + '</select>') + labelOf('Sumber pesanan', '<select id="fso">' + opt(['WhatsApp', 'Telepon', 'Datang langsung'], d.so) + '</select>') +
    labelOf('Sumber unit', '<select id="sr"' + dis + '><option value="0">Milik usaha</option><option value="1"' + (d.rk ? ' selected' : '') + '>Rekanan</option></select>') +
    labelOf('Ambil', '<input id="fs" type="datetime-local" step="1800" value="' + d.s + '"' + dis + '>') + labelOf('Kembali', '<input id="fe" type="datetime-local" step="1800" value="' + d.e + '">') + src +
    labelOf('BBM saat diambil (bar, 0–8)', '<input id="fbb" type="number" min="0" max="8" placeholder="Contoh: 4" value="' + esc(d.bbm) + '"' + dis + '>') +
    labelOf('Kondisi unit saat diambil (opsional)', '<input id="fko" placeholder="Contoh: lecet kecil di pintu kiri" value="' + esc(d.kondisi) + '">') + labelOf('Catatan', '<input id="fc" value="' + esc(d.note) + '">') + '</div></div>' +
    '<div class="card"><h2>' + gi('card', 24) + 'Jaminan</h2><div class="mu">KTP untuk penyewa luar Padang, kendaraan bermotor untuk penyewa Padang. Hanya jenisnya yang disimpan.</div><div class="bar">' +
    ['KTP', 'Kendaraan bermotor'].map(function (g) { return '<label class="sw"><input type="radio" name="j" value="' + g + '"' + (d.g === g ? ' checked' : '') + '> ' + g + '</label>'; }).join('') + '</div></div>' +
    '<div class="card"><h2>' + gi('coin', 24) + 'Pembayaran</h2>' + (d.rk ? '<div class="row"><span>Selisih (untung dari rekanan)</span><b id="sl"></b></div>' : '') +
    '<div class="row"><span>Total sewa</span><b id="t1"></b></div>' +
      labelOf('Dibayar sekarang (Rp)', '<input id="fp" type="number" min="0" placeholder="Kosongkan jika belum bayar" value="' + esc(d.paid) + '">') +
      '<div class="bar"><button class="btn o" data-act="pset" data-k=".5">DP 50%</button><button class="btn o" data-act="pset" data-k="1">Lunas</button></div><div class="row"><span>Sisa</span><b id="t3"></b></div><div class="mu" id="t4"></div>' + '</div>' +
    '<button class="btn" data-act="simpan">Simpan booking</button>';
}
function readForm() {
  var g = function (id) { var e = $('#' + id); return e ? e.value : null; }, d = draft;
  d.name = g('fn'); d.wa = g('fw'); d.rent = g('fj'); d.so = g('fso'); d.s = g('fs'); d.e = g('fe'); d.note = g('fc'); d.bbm = g('fbb'); d.kondisi = g('fko');
  if ($('#fp')) d.paid = g('fp');
  var jr = document.querySelector('input[name="j"]:checked'); d.g = jr ? jr.value : '';
  d.rk = g('sr') === '1';
  if (d.rk) { d.partner = g('fpn') || ''; d.runit = g('fru') || ''; d.cost = g('fb') || ''; d.price = g('fh') || ''; }
  else { if (g('fu')) d.unitId = +g('fu'); if ($('#fd')) d.driver = g('fd') === '1'; }
}
function totalOf(d) { var u = unitById(d.unitId); return d.rk ? Math.max(0, +d.price || 0) : (u ? days(d.s, d.e) * u.tarif_harian : 0); }
function calc() {
  if (!$('#t1')) return; readForm();
  var t = totalOf(draft), p = Math.max(0, +draft.paid || 0);
  $('#t1').textContent = rp(t);
  if ($('#t3')) { $('#t3').textContent = rp(Math.max(0, t - p)); $('#t4').textContent = p >= t && t > 0 ? 'Lunas' : p > 0 ? 'DP dicatat, status Dibooking' : 'Belum bayar, status Menunggu DP'; }
  if ($('#sl')) $('#sl').textContent = rp((+draft.price || 0) - (+draft.cost || 0));
}
async function saveBooking() {
  readForm(); var d = draft, bn = function (m) { $('#ban').innerHTML = alertBox(m); window.scrollTo(0, 0); };
  if (!d.name.trim()) return bn('Nama pelanggan wajib diisi.');
  if (D(d.e) <= D(d.s)) return bn('Waktu kembali harus setelah waktu ambil.');
  if (!/^[0-8]$/.test(String(d.bbm).trim())) return bn('Isi level BBM saat diambil (0–8 bar).');
  if (!d.g) return bn('Pilih jenis jaminan.');
  var body = { nama_pelanggan: d.name.trim(), no_wa: d.wa.trim(), jenis_sewa: d.rent, sumber: d.so, selesai: d.e, bbm_ambil: +d.bbm, kondisi_ambil: d.kondisi.trim(), jaminan: d.g, catatan: d.note.trim(), mulai: d.s };
  if (d.rk) body.rekanan = { nama: d.partner.trim(), unit: d.runit.trim(), biaya: +d.cost || 0, harga: +d.price || 0 };
  else { body.unit_id = +d.unitId; body.dengan_driver = d.driver ? 1 : 0; }
  try {
    if (+d.paid > 0) body.uang_muka = +d.paid;
    var r = await api('POST', '/pemesanan', body);
    draft = null; toast('Booking ' + r.kode + ' tersimpan.'); location.hash = '#detail/' + r.id;
  } catch (e) { bn(esc(e.message)); }
}

/* ===== Detail ===== */
function detView() {
  var b = cur; if (!b) return '<h1>Booking tidak ditemukan</h1><a class="btn" href="#jadwal">Ke jadwal</a>';
  var S = ['Menunggu DP', 'Dibooking', 'Disewa', 'Selesai'], i = S.indexOf(b.status);
  var row = function (a, v) { return '<div class="row"><span>' + a + '</span><b>' + v + '</b></div>'; };
  var tambah = b.denda + b.biaya_bbm + b.ganti_rugi;
  return '<div class="bar" style="margin:0"><h1 style="margin:0">' + b.kode + '</h1>' + badge(b.status) + '</div>' +
    '<div class="step">' + S.map(function (x, k) { return '<div class="' + (k <= i ? 'on' : '') + '"><i></i>' + x + '</div>'; }).join('') + '</div>' + (b.status === 'Dibatalkan' ? alertBox('Booking dibatalkan.' + (b.dp_hangus ? ' DP ' + rp(b.dp_hangus) + ' hangus.' : '')) : '') + '<div id="dmsg"></div>' +
    '<div class="g2"><div class="card"><h2>' + gi('user', 24) + 'Ringkasan</h2>' + row('Pelanggan', esc(b.nama_pelanggan)) + row('WhatsApp', esc(b.no_wa)) +
    row('Unit', esc(unitName(b)) + (b.rekanan_nama ? ' · ' + esc(b.rekanan_nama) : '')) + row('Periode', fd(b.mulai) + ' – ' + fd(b.selesai)) + row('Jenis sewa · sumber', b.jenis_sewa + ' · ' + b.sumber) +
    row('Driver', b.dengan_driver ? 'Ya' : 'Tidak') + (b.jaminan ? row('Jaminan', b.jaminan) : '') + (b.bbm_ambil != null ? row('BBM saat diambil', b.bbm_ambil + ' bar') : '') +
    (b.bbm_kembali != null ? row('BBM saat kembali', b.bbm_kembali + ' bar') : '') + (b.kondisi_ambil ? row('Kondisi saat diambil', esc(b.kondisi_ambil)) : '') + (b.kondisi_kembali ? row('Kondisi saat kembali', esc(b.kondisi_kembali)) : '') +
    (b.catatan ? row('Catatan', esc(b.catatan)) : '') + '</div>' +
    '<div class="card"><h2>' + gi('coin', 24) + 'Pembayaran</h2>' + (b.rekanan_nama ? row('Selisih (untung dari rekanan)', rp(b.selisih_rekanan)) : '') + row('Total sewa', rp(b.total_sewa)) +
    (tambah ? row('Denda', rp(b.denda)) + row('Biaya BBM', rp(b.biaya_bbm)) + row('Ganti rugi', rp(b.ganti_rugi)) + row('Total biaya', rp(b.tagihan)) : '') +
    row('Sudah dibayar', rp(b.dibayar) + (b.sisa === 0 && b.dibayar > 0 ? ' · Lunas' : b.dibayar > 0 ? ' · DP dicatat' : ' · belum ada')) + row('Sisa', rp(b.sisa)) +
    (b.status !== 'Dibatalkan' && b.sisa > 0 ? labelOf('Jumlah dibayar (Rp)', '<input id="pa" type="number" min="0" placeholder="Nominal">').replace('<label>', '<label style="margin-top:8px">') +
      '<div class="bar">' + (b.dibayar ? '' : '<button class="btn o" data-act="paset" data-v="' + Math.round(b.total_sewa / 2) + '">DP 50%</button>') + '<button class="btn o" data-act="paset" data-v="' + b.sisa + '">Lunas</button><button class="btn" data-act="catat">' + (b.dibayar ? 'Catat pelunasan' : 'Catat DP') + '</button></div>' : '') +
    '</div></div>' +
    '<div class="bar">' + (b.status === 'Dibooking' ? '<button class="btn" data-act="mulai">Mulai sewa</button>' : '') +
    (b.status === 'Disewa' ? '<a class="btn" href="#kembali/' + b.id + '">Pengembalian</a><button class="btn o" data-act="perp">Perpanjang sewa</button>' : '') +
    (b.status === 'Menunggu DP' || b.status === 'Dibooking' ? '<button class="btn d" data-act="batalq">Batalkan</button>' : '') + '</div><div id="md"></div>';
}
var modal = function (id, title, inner, ok) {
  $('#md').innerHTML = '<div class="mod" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="card" id="' + id + '"><h2 id="mt">' + title + '</h2>' + inner + '<div id="merr" role="alert"></div><div class="bar">' + ok + '<button class="btn o" data-act="tutup">Batal</button></div></div></div>';
};
function pcalc() {
  var b = cur, ne = $('#pe').value, out = $('#pp'), u = unitById(b.unit_id);
  if (!ne || D(ne) <= D(b.selesai)) { out.innerHTML = '<div class="mu">Pilih waktu kembali baru setelah ' + fd(b.selesai) + '.</div>'; return null; }
  var extra = u ? Math.round((days(b.mulai, ne) - days(b.mulai, b.selesai)) * (b.total_sewa / days(b.mulai, b.selesai))) : Math.max(0, +$('#px').value || 0);
  out.innerHTML = '<div class="row"><span>Biaya tambahan</span><b>' + rp(extra) + '</b></div><div class="row"><span>Total sewa baru</span><b>' + rp(b.total_sewa + extra) + '</b></div>';
  return { ne: ne, extra: extra };
}

/* ===== Pengembalian ===== */
function kemView() {
  var b = cur;
  if (!b || b.status !== 'Disewa') return '<h1>Pengembalian unit</h1><div class="card"><div class="mu">Pengembalian hanya untuk booking berstatus Disewa.</div></div><a class="btn" href="#jadwal">Ke jadwal</a>';
  return '<h1>Pengembalian unit</h1><div class="mu">' + b.kode + ' · ' + esc(unitName(b)) + ' · rencana kembali ' + fd(b.selesai) + '</div><div id="kerr" role="alert"></div><div id="kf"><div class="card" style="margin-top:14px"><div class="g2">' +
    labelOf('Waktu kembali *', '<input id="ka" type="datetime-local" required>') + labelOf('BBM saat diambil (bar), dari data booking', '<input type="number" value="' + (b.bbm_ambil == null ? '' : b.bbm_ambil) + '" disabled>') +
    labelOf('BBM saat kembali (bar, 0–8)', '<input id="k2" type="number" min="0" max="8" placeholder="Contoh: 4">') + labelOf('Kondisi unit saat kembali', '<input id="kk" placeholder="Contoh: tidak ada kerusakan">') + '</div></div>' +
    '<div class="card"><h2>' + gi('coin', 24) + 'Biaya tambahan (diisi pengelola)</h2><div class="g2">' + labelOf('Denda keterlambatan (Rp)', '<input id="k3" type="number" min="0" placeholder="0">') +
    labelOf('Biaya bahan bakar (Rp)', '<input id="k4" type="number" min="0" placeholder="0">') + labelOf('Ganti rugi kerusakan (Rp)', '<input id="k5" type="number" min="0" placeholder="0">') + '</div><div id="kr" style="margin-top:8px"></div>' +
    labelOf('Dibayar sekarang (Rp)', '<input id="kp" type="number" min="0" placeholder="Kosongkan jika belum bayar">') + '</div></div><button class="btn" data-act="kfin">Selesaikan booking</button>';
}
function kcalc() {
  var b = cur; if (!b || !$('#kr')) return;
  var n = function (id) { return Math.max(0, +$(id).value || 0); }, tt = b.total_sewa + n('#k3') + n('#k4') + n('#k5');
  $('#kr').innerHTML = [['Total sewa', rp(b.total_sewa)], ['Total biaya', rp(tt)], ['Sudah dibayar', rp(b.dibayar)], ['Sisa pembayaran', rp(Math.max(0, tt - b.dibayar))]].map(function (x) { return '<div class="row"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('');
}

/* ===== Servis ===== */
function serView() {
  var t = new Date(); t.setHours(8, 0, 0, 0);
  var list = servis.slice().sort(function (a, b) { return D(b.mulai) - D(a.mulai); });
  return '<h1>Servis unit</h1><div class="card" style="margin-top:14px"><div class="g2">' +
    labelOf('Unit', '<select id="su">' + units.map(function (u) { return '<option value="' + u.id + '">' + esc(u.nama) + '</option>'; }).join('') + '</select>') +
    labelOf('Mulai', '<input id="s1" type="datetime-local" step="1800" value="' + iso(t) + '">') + labelOf('Selesai', '<input id="s2" type="datetime-local" step="1800" value="' + iso(new Date(+t + DAY)) + '">') +
    labelOf('Alasan', '<input id="sa" placeholder="Contoh: ganti oli">') + '</div></div><div id="sb"></div><button class="btn" data-act="svsave">Simpan servis</button>' +
    '<div class="mu" style="margin-top:10px">Periode servis memblokir unit. Tidak ada notifikasi otomatis.</div>' +
    (list.length ? '<div class="card" style="margin-top:14px"><h2>' + gi('wrench', 24) + 'Jadwal servis</h2>' + list.map(function (v) {
      return '<div class="row"><span>' + esc(v.unit_nama) + (v.alasan ? ' · ' + esc(v.alasan) : '') + '</span><span><b>' + fs(v.mulai) + ' – ' + fs(v.selesai) + '</b> <button class="btn o" data-act="svdel" data-id="' + v.id + '">Hapus</button></span></div>';
    }).join('') + '</div>' : '');
}

/* ===== Laporan ===== */
function repInit() { if (!rep) { var n = new Date(); rep = { m: n.getMonth(), y: n.getFullYear() }; } }
var lapLabel = function () { repInit(); return (rep.m >= 0 ? BLN[rep.m] + ' ' : 'Tahun ') + rep.y; };
var NUMH = /^(Booking|Total sewa|Total|Dibayar|Sisa)$/;
function tbl(head, rows, foot, kind) {
  return '<div class="card report-table ' + (kind || '') + '"><table class="nw"><thead><tr>' + head.map(function (h) { return '<th' + (NUMH.test(h) ? ' class="num"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
    (rows.join('') || '<tr><td colspan="' + head.length + '" class="mu">Tidak ada data pada periode ini.</td></tr>') + '</tbody>' +
    (rows.length && foot ? '<tfoot><tr>' + foot + '</tr></tfoot>' : '') + '</table></div>';
}
var tdn = function (v) { return '<td class="num">' + v + '</td>'; };
var sum = function (L, fn) { return L.reduce(function (a, b) { return a + fn(b); }, 0); };
function lapView() {
  repInit(); var R = lap.ringkasan;
  var stat = function (t, v, c, sub) { return '<div class="report-stat"><div class="report-stat-label">' + t + '</div><div class="report-stat-value"' + (c ? ' style="color:' + c + '"' : '') + '>' + v + '</div>' + (sub ? '<div class="report-stat-sub">' + sub + '</div>' : '') + '</div>'; };
  var gr = function (G) { return G.map(function (g) { return '<tr><td><b>' + esc(g.nama) + '</b></td>' + tdn(g.jumlah_pemesanan) + tdn(rp(g.dibayar)) + '</tr>'; }); };
  var gf = function (G) { return '<td><b>Jumlah</b></td>' + tdn(sum(G, function (g) { return g.jumlah_pemesanan; })) + tdn(rp(sum(G, function (g) { return g.dibayar; }))); };
  var cy = new Date().getFullYear(), ys = [cy - 1, cy, cy + 1, rep.y], y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), yo = '';
  for (var y = y1; y >= y0; y--) yo += '<option' + (y === rep.y ? ' selected' : '') + '>' + y + '</option>';
  var mo = '<option value="-1"' + (rep.m < 0 ? ' selected' : '') + '>Semua bulan</option>' + BLN.map(function (n, i) { return '<option value="' + i + '"' + (rep.m === i ? ' selected' : '') + '>' + n + '</option>'; }).join('');
  var ok = lap.daftar.filter(function (b) { return b.status !== 'Dibatalkan'; });
  return '<div class="report-header"><div class="report-brand">' + car(32) + '<div><b>Habibie Rent Car</b><h1>Laporan ' + esc(lapLabel()) + '</h1></div></div><div class="report-period"><span>Periode:</span><b>' + esc(lapLabel()) + '</b></div></div>' +
    '<div class="card noprint" style="margin-top:14px"><div class="fl">' + labelOf('Bulan', '<select id="rm">' + mo + '</select>') + labelOf('Tahun', '<select id="ry">' + yo + '</select>') +
    '<div class="bar"><button class="btn o" data-act="bulan">Bulan ini</button><button class="btn o" data-act="csv">Unduh CSV</button><button class="btn" data-act="print">Cetak</button></div></div>' +
    '<div class="pk"><span class="mu">Bagian yang dicetak</span>' + [['ring', 'Ringkasan'], ['pel', 'Per pelanggan'], ['uni', 'Per unit'], ['bok', 'Daftar booking']].map(function (x) { return '<label class="ck"><input type="checkbox" data-sec="' + x[0] + '"' + (pick[x[0]] ? ' checked' : '') + '> ' + x[1] + '</label>'; }).join('') + '</div></div>' +
    '<div class="sec" data-s="ring"><div class="report-stats">' + stat('Pemasukan diterima', rp(R.pemasukan_diterima), 'var(--gt)') + stat('Total biaya', rp(R.total_tagihan), '', 'tanpa booking batal') + stat('Belum dibayar', rp(R.belum_dibayar), 'var(--wt)') +
    stat('Jumlah booking', R.jumlah_pemesanan, '', R.jumlah_dibatalkan ? R.jumlah_dibatalkan + ' batal' : '') + (R.jumlah_dibatalkan ? stat('DP hangus', rp(R.dp_hangus), '', 'dari booking batal') : '') +
    (lap.daftar.some(function (b) { return b.rekanan_nama; }) ? stat('Selisih rekanan', rp(R.selisih_rekanan)) : '') + '</div></div>' +
    '<div class="sec" data-s="pel"><h2>Rekap per pelanggan</h2>' + tbl(['Pelanggan', 'Booking', 'Dibayar'], gr(lap.per_pelanggan), gf(lap.per_pelanggan), 'summary') + '</div>' +
    '<div class="sec" data-s="uni"><h2>Rekap per unit</h2>' + tbl(['Unit', 'Booking', 'Dibayar'], gr(lap.per_unit), gf(lap.per_unit), 'summary') + '</div>' +
    '<div class="sec" data-s="bok"><h2>Daftar booking</h2>' + tbl(['Kode', 'Pelanggan', 'Unit', 'Ambil', 'Kembali', 'Status', 'Total', 'Dibayar', 'Sisa'], lap.daftar.map(function (b) {
      b = mapB(b); return '<tr class="k" data-go="detail/' + b.id + '"><td><a href="#detail/' + b.id + '"><b>' + b.kode + '</b></a></td><td>' + esc(b.nama_pelanggan) + '</td><td>' + esc(unitName(b)) + '</td><td>' + dt(b.mulai) + '</td><td>' + dt(b.selesai) + '</td><td>' + badge(b.status) + '</td>' +
        tdn(rp(b.tagihan)) + tdn(rp(b.dibayar)) + tdn(b.status === 'Dibatalkan' ? '–' : rp(b.sisa)) + '</tr>';
    }), '<td colspan="6"><b>Jumlah</b></td>' + tdn(rp(sum(ok, function (b) { return b.tagihan; }))) + tdn(rp(sum(lap.daftar, function (b) { return b.dibayar; }))) + tdn(rp(sum(ok, function (b) { return b.sisa; }))), 'bookings') + '</div>';
}
function lapPrint() {
  var all = document.querySelectorAll('.sec'), n = 0;
  all.forEach(function (x) { var on = pick[x.dataset.s]; x.classList.toggle('noprint', !on); if (on) n++; });
  if (!n) { toast('Pilih minimal satu bagian untuk dicetak.'); return; }
  window.print(); all.forEach(function (x) { x.classList.remove('noprint'); });
}
function lapCsv() {
  var q2 = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
  var rows = [['Kode', 'Pelanggan', 'WhatsApp', 'Unit', 'Ambil', 'Kembali', 'Status', 'Tagihan', 'Dibayar', 'Sisa']].concat(lap.daftar.map(function (b) { return [b.kode, b.nama_pelanggan, b.no_wa, unitName(b), T(b.mulai).replace('T', ' '), T(b.selesai).replace('T', ' '), b.status, b.tagihan, b.dibayar, b.sisa]; }));
  var blob = new Blob(['\ufeff' + rows.map(function (r) { return r.map(q2).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'laporan-' + lapLabel().toLowerCase().replace(/ /g, '-') + '.csv'; document.body.appendChild(a); a.click(); a.remove();
}

/* ===== Router ===== */
async function route() {
  var my = ++rid, r = (location.hash || '#login').slice(1).split('/')[0], id = curId();
  if (r === 'unit') r = 'servis';
  if (r !== 'login' && !token) { location.hash = '#login'; return; }
  var P = { login: 1, ketersediaan: 1, jadwal: 1, booking: 1, detail: 1, kembali: 1, laporan: 1, servis: 1 };
  if (!P[r]) r = token ? 'ketersediaan' : 'login';
  if (r === 'login') { $('#app').innerHTML = loginView(); return; }
  try {
    await refresh();
    if (r === 'ketersediaan') {
      if (!q) { var t = new Date(); t.setHours(8, 0, 0, 0); q = { s: iso(t), e: iso(new Date(+t + DAY)), trans: '' }; }
      kres = null; kerr = '';
      try { nonaktif = (await api('GET', '/unit?semua=1')).filter(function (u) { return !u.aktif; }); } catch (e) { nonaktif = []; }
      if (D(q.e) > D(q.s)) { try { kres = await api('GET', '/ketersediaan?mulai=' + q.s + '&selesai=' + q.e + (q.trans ? '&transmisi=' + q.trans : '')); } catch (e) { kerr = e.message; } }
    } else if (r === 'detail' || r === 'kembali') {
      try { cur = mapB(await api('GET', '/pemesanan/' + id)); } catch (e) { cur = null; }
    } else if (r === 'laporan') { repInit(); lap = await api('GET', '/laporan?tahun=' + rep.y + (rep.m >= 0 ? '&bulan=' + (rep.m + 1) : '')); }
    else if (r === 'booking' && !draft) draft = newDraft();
  } catch (e) { if (my === rid && token) $('#app').innerHTML = shell('', '<h1>Gagal memuat data</h1>' + alertBox(esc(e.message)) + '<button class="btn" data-act="reload">Muat ulang</button>'); return; }
  if (my !== rid) return;
  var nav = r === 'detail' || r === 'kembali' ? 'booking' : r;
  var V = { ketersediaan: ketView, jadwal: jadView, booking: bookView, detail: detView, kembali: kemView, laporan: lapView, servis: serView };
  $('#app').innerHTML = shell(nav, V[r]());
  if (r === 'booking') calc();
  if (r === 'kembali') kcalc();
}
window.addEventListener('hashchange', function () { if (location.hash.indexOf('#booking') !== 0) draft = null; route(); window.scrollTo(0, 0); });

/* ===== Event ===== */
var run = function (fn) { return Promise.resolve().then(fn).catch(function (e) { toast(e.message); }); };
document.addEventListener('submit', function (e) { if (e.target.id === 'lf') { e.preventDefault(); doLogin(); } });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#md') && $('#md').innerHTML) $('#md').innerHTML = ''; });
document.addEventListener('wheel', function (e) { if (e.target.type === 'number' && document.activeElement === e.target) e.target.blur(); }, { passive: true });
document.addEventListener('input', function (e) {
  var id = e.target.id; if (id === 'fp' || id === 'fb' || id === 'fh') calc();
  if (e.target.closest('#kf')) kcalc(); if (e.target.closest('#pf')) pcalc();
});
document.addEventListener('change', function (e) {
  var id = e.target.id;
  if (e.target.dataset && e.target.dataset.sec) pick[e.target.dataset.sec] = e.target.checked ? 1 : 0;
  else if (id === 'sr' || id === 'fu' || id === 'fs' || id === 'fe') { readForm(); if (id === 'fu') draft.driver = false; route(); }
  else if (e.target.name === 'j' || id === 'fd') readForm();
  else if (e.target.closest && e.target.closest('#pf')) pcalc();
  else if (id === 'rm' || id === 'ry') { rep = { m: +$('#rm').value, y: +$('#ry').value }; route(); }
  else if (id === 'jf') { jf = e.target.value; route(); }
});
document.addEventListener('click', function (e) {
  var row = e.target.closest('tr[data-go]'); if (row && !e.target.closest('a')) { location.hash = '#' + row.dataset.go; return; }
  var el = e.target.closest('[data-act]'); if (!el) return;
  var a = el.dataset.act, id = curId();
  if (a === 'eye') { var p = $('#pw'); p.type = p.type === 'password' ? 'text' : 'password'; }
  else if (a === 'logout') { run(function () { return api('POST', '/auth/logout').catch(function () { }); }); setSession(null); q = null; draft = null; }
  else if (a === 'cek') { q = { s: $('#ks').value, e: $('#ke').value, trans: $('#kx').value }; route(); }
  else if (a === 'buat') { draft = newDraft(el.dataset.rk ? { rk: true, s: q.s, e: q.e } : { unitId: +el.dataset.u, s: q.s, e: q.e }); if (location.hash === '#booking') route(); else location.hash = '#booking'; }
  else if (a === 'view') { view = el.dataset.v; route(); }
  else if (a === 'wk') { var n = +el.dataset.d; wkStart = n ? new Date(+wkStart + n * DAY) : null; route(); }
  else if (a === 'pset') { readForm(); $('#fp').value = Math.round(totalOf(draft) * +el.dataset.k); calc(); }
  else if (a === 'simpan') saveBooking();
  else if (a === 'paset') $('#pa').value = el.dataset.v;
  else if (a === 'catat') run(async function () {
    var amt = +$('#pa').value; if (!(amt > 0)) { toast('Isi jumlah dibayar.'); return; }
    await api('POST', '/pemesanan/' + id + '/pembayaran', { jenis: cur.dibayar > 0 ? 'Pelunasan' : 'DP', nominal: amt }); toast('Pembayaran dicatat.'); route();
  });
  else if (a === 'mulai') run(async function () {
    await api('POST', '/pemesanan/' + id + '/pengambilan', {});
    toast('Sewa dimulai.'); route();
  });
  else if (a === 'batalq') modal('bf', 'Batalkan booking?', alertBox(cur.dibayar > 0 ? 'DP ' + rp(cur.dibayar) + ' hangus.' : 'Booking dihapus dari jadwal tanpa biaya.', cur.dibayar > 0 ? 'R' : 'W'), '<button class="btn d" data-act="batal">Ya, batalkan</button>');
  else if (a === 'batal') run(async function () { try { await api('POST', '/pemesanan/' + id + '/batal'); toast('Booking dibatalkan.'); route(); } catch (x) { $('#merr').innerHTML = alertBox(esc(x.message)); } });
  else if (a === 'perp') { modal('pf', 'Perpanjang sewa', '<div class="mu">Kembali saat ini: ' + fd(cur.selesai) + '</div>' + labelOf('Waktu kembali baru', '<input id="pe" type="datetime-local" step="1800" value="' + iso(new Date(+D(cur.selesai) + DAY)) + '">').replace('<label>', '<label style="margin-top:10px">') +
      (cur.rekanan_nama ? labelOf('Biaya tambahan (Rp)', '<input id="px" type="number" min="0" placeholder="0">').replace('<label>', '<label style="margin-top:10px">') : '') + '<div id="pp" style="margin-top:10px"></div>', '<button class="btn" data-act="perpsave">Simpan perpanjangan</button>'); pcalc(); }
  else if (a === 'perpsave') run(async function () {
    var c = pcalc(); if (!c) { $('#merr').innerHTML = alertBox('Waktu kembali baru harus setelah waktu kembali saat ini.'); return; }
    var body = { selesai: c.ne }; if (cur.rekanan_nama) body.rekanan = { harga: cur.total_sewa + c.extra };
    try { await api('PATCH', '/pemesanan/' + id, body); toast('Sewa diperpanjang sampai ' + fd(c.ne) + '.'); route(); } catch (x) { $('#merr').innerHTML = alertBox(esc(x.message)); }
  });
  else if (a === 'kfin') run(async function () {
    var bn = function (m) { $('#kerr').innerHTML = alertBox(m); window.scrollTo(0, 0); };
    if (!$('#ka').value) return bn('Isi waktu kembali.');
    if (!/^[0-8]$/.test($('#k2').value.trim())) return bn('Isi level BBM saat kembali (0–8 bar).');
    var num = function (s) { return Math.max(0, Math.round(+$(s).value || 0)); };
    try {
      await api('POST', '/pemesanan/' + id + '/pengembalian', { waktu_kembali: $('#ka').value, bbm_kembali: +$('#k2').value, kondisi_kembali: $('#kk').value.trim(), denda: num('#k3'), biaya_bbm: num('#k4'), ganti_rugi: num('#k5'), pembayaran: num('#kp') });
      toast('Booking selesai, unit kembali Tersedia.'); location.hash = '#detail/' + id;
    } catch (x) { bn(esc(x.message)); }
  });
  else if (a === 'svsave') run(async function () {
    var bn = function (m) { $('#sb').innerHTML = alertBox(m); };
    try { await api('POST', '/servis', { unit_id: +$('#su').value, mulai: $('#s1').value, selesai: $('#s2').value, alasan: $('#sa').value.trim() }); toast('Servis tersimpan.'); route(); } catch (x) { bn(esc(x.message)); }
  });
  else if (a === 'svdel') run(async function () { await api('DELETE', '/servis/' + el.dataset.id); toast('Servis dihapus.'); route(); });
  else if (a === 'bulan') { rep = null; route(); }
  else if (a === 'csv') lapCsv();
  else if (a === 'print') lapPrint();
  else if (a === 'ut') unitForm();
  else if (a === 'ue') { var uu = unitById(el.dataset.u) || nonaktif.find(function (x) { return x.id === +el.dataset.u; }); if (uu) unitForm(uu); }
  else if (a === 'usave') run(async function () {
    var uid = el.dataset.id;
    var body = { nama: $('#un').value.trim(), plat: $('#up').value.trim(), transmisi: $('#ut').value, tarif_harian: $('#ur').value, dengan_driver: $('#ud').checked };
    try { await api(uid ? 'PATCH' : 'POST', '/unit' + (uid ? '/' + uid : ''), body); toast(uid ? 'Unit diperbarui.' : 'Unit ditambahkan.'); route(); } catch (x) { $('#merr').innerHTML = alertBox(esc(x.message)); }
  });
  else if (a === 'unon') { var un = unitById(el.dataset.id); modal('uf', 'Nonaktifkan unit?', alertBox(esc(un ? un.nama : 'Unit') + ' tidak akan tampil di ketersediaan dan tidak bisa dibooking. Bisa diaktifkan lagi dari daftar "Unit nonaktif".', 'W'), '<button class="btn d" data-act="unon2" data-id="' + el.dataset.id + '">Ya, nonaktifkan</button>'); }
  else if (a === 'unon2') run(async function () {
    try { await api('PATCH', '/unit/' + el.dataset.id, { aktif: false }); toast('Unit dinonaktifkan.'); route(); } catch (x) { $('#merr').innerHTML = alertBox(esc(x.message)); }
  });
  else if (a === 'uaktif') run(async function () { await api('PATCH', '/unit/' + el.dataset.id, { aktif: true }); toast('Unit diaktifkan kembali.'); route(); });
  else if (a === 'reload') location.reload();
  else if (a === 'tutup') $('#md').innerHTML = '';
});
route();
