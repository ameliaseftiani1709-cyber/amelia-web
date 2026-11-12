// js/pages.js — isi setiap halaman
import { api } from './api.js';
import {
  $, state, esc, tag, toast, openModal, closeModal, confirmDialog, setLoading,
  fmtDate, timeAgo, todayISO, daysSince, emptyState, countUp,
} from './ui.js';

const isAdmin = () => state.user?.role === 'admin';

// Tombol di kanan judul halaman. Hanya dipasang jika halaman ini masih tampil.
function setActions(el, html) {
  if (el.isConnected) $('#page-actions').innerHTML = html;
  return $('#page-actions');
}

const statusOf = (i) => (i.tersedia === 0 ? 'habis' : i.tersedia <= Math.ceil(i.stok * 0.3) ? 'menipis' : 'tersedia');
const STOCK_BADGE = {
  tersedia: '<span class="badge ok">Tersedia</span>',
  menipis: '<span class="badge warn">Menipis</span>',
  habis: '<span class="badge bad">Habis</span>',
};
const meterClass = (s) => (s === 'habis' ? 'out' : s === 'menipis' ? 'low' : '');
const trxBadge = (s) => (s === 'selesai' ? '<span class="badge ok">Selesai</span>' : '<span class="badge warn">Dipinjam</span>');

/* =====================================================
   DASHBOARD
===================================================== */
const FEED_ICON = {
  pinjam: 'ri-hand-coin-line', kembali: 'ri-arrow-go-back-line', barang: 'ri-archive-line',
  hapus: 'ri-delete-bin-line', pengguna: 'ri-user-settings-line',
};

async function dashboard(el) {
  const admin = isAdmin();
  const d = await api('/dashboard');
  const s = d.stats;
  const pct = s.total ? Math.round((s.tersedia / s.total) * 100) : 0;

  setActions(el, `
    <a class="btn btn-primary" href="#/peminjaman"><i class="ri-add-line"></i> Catat peminjaman</a>
    <a class="btn btn-ghost" href="#/pengembalian"><i class="ri-arrow-go-back-line"></i> Pengembalian</a>`);

  const kpi = (tone, label, icon, value, sub) => `
    <div class="kpi ${tone}">
      <div class="kpi-top"><span>${label}</span><i class="${icon}"></i></div>
      <div class="kpi-value" data-count="${value}">0</div>
      <small>${sub}</small>
    </div>`;

  el.innerHTML = `
    <div class="kpis">
      ${kpi('', 'Total barang', 'ri-archive-2-line', s.total, `${s.jenis} jenis barang`)}
      ${kpi('green', 'Tersedia', 'ri-checkbox-circle-line', s.tersedia, `${pct}% dari seluruh unit`)}
      ${kpi('amber', 'Sedang dipinjam', 'ri-hand-coin-line', s.dipinjam, `${s.aktif} transaksi berjalan`)}
      ${kpi('blue', 'Total transaksi', 'ri-file-list-3-line', s.transaksi,
        admin ? `${s.extra} staff aktif` : `${s.extra} dicatat oleh Anda`)}
    </div>

    <div class="dash-grid">
      <div class="dash-col">
        <section class="panel">
          <div class="panel-head"><h2>Belum dikembalikan</h2><a href="#/pengembalian">Proses pengembalian</a></div>
          ${d.active.length ? d.active.map((t) => {
            const days = daysSince(t.tanggal_pinjam);
            return `<div class="loan-row">
              ${tag(t.kode)}
              <div><b>${esc(t.item_nama)} (${t.jumlah} unit)</b><small>${esc(t.peminjam)}, dipinjam ${fmtDate(t.tanggal_pinjam)}</small></div>
              <span class="pill ${days > 7 ? 'late' : ''}">${days} hari</span>
            </div>`;
          }).join('') : emptyState('ri-checkbox-circle-line', 'Semua barang sudah kembali.')}
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Aktivitas terbaru</h2><a href="#/riwayat">Lihat riwayat</a></div>
          ${d.logs.length ? d.logs.map((l) => `
            <div class="feed-item">
              <span class="feed-icon ${esc(l.aksi)}"><i class="${FEED_ICON[l.aksi] || 'ri-information-line'}"></i></span>
              <div><p>${esc(l.detail)}</p><small>${esc(l.actor_name || 'Sistem')}, ${timeAgo(l.created_at)}</small></div>
            </div>`).join('') : emptyState('ri-inbox-line', 'Belum ada aktivitas.')}
        </section>
      </div>

      <div class="dash-col">
        <section class="panel">
          <div class="panel-head"><h2>Ketersediaan per kategori</h2></div>
          ${d.categories.length ? d.categories.map((c) => {
            const p = c.stok ? Math.round((c.tersedia / c.stok) * 100) : 0;
            const cls = p === 0 ? 'out' : p <= 30 ? 'low' : '';
            return `<div class="cat-row">
              <div class="cat-top"><span>${esc(c.kategori)}</span><b>${c.tersedia} / ${c.stok}</b></div>
              <div class="meter"><div class="${cls}" style="width:${p}%"></div></div>
            </div>`;
          }).join('') : emptyState('ri-archive-line', 'Belum ada data barang.')}
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Stok menipis</h2><a href="#/barang">Data barang</a></div>
          ${d.low.length ? d.low.map((i) => `
            <div class="low-row">
              <span>${tag(i.kode)} ${esc(i.nama)}</span>
              ${STOCK_BADGE[statusOf(i)].replace('</span>', ` ${i.tersedia}/${i.stok}</span>`)}
            </div>`).join('') : emptyState('ri-shield-check-line', 'Tidak ada stok yang menipis.')}
        </section>
      </div>
    </div>`;

  countUp(el);
}

/* =====================================================
   DATA BARANG
===================================================== */
function nextCode(items) {
  const nums = items.map((i) => /^BR(\d+)$/i.exec(i.kode)?.[1]).filter(Boolean).map(Number);
  return `BR${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

function itemForm(item, items, onSaved) {
  const cats = [...new Set(items.map((i) => i.kategori))].sort();
  const dipinjam = item ? item.stok - item.tersedia : 0;
  const body = openModal(item ? 'Ubah barang' : 'Tambah barang', `
    <form class="form" id="item-form">
      <div class="grid-2">
        <label class="field"><span>Kode barang</span>
          <input name="kode" required maxlength="20" value="${esc(item?.kode ?? nextCode(items))}" /></label>
        <label class="field"><span>Kategori</span>
          <input name="kategori" required maxlength="50" list="cat-list" value="${esc(item?.kategori ?? '')}" placeholder="mis. Laptop" />
          <datalist id="cat-list">${cats.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></label>
      </div>
      <label class="field"><span>Nama barang</span>
        <input name="nama" required maxlength="100" value="${esc(item?.nama ?? '')}" placeholder="mis. Laptop Lenovo ThinkPad" /></label>
      <div class="grid-2">
        <label class="field"><span>Jumlah stok</span>
          <input name="stok" type="number" min="${dipinjam}" max="100000" required value="${item?.stok ?? 1}" /></label>
        <label class="field"><span>Lokasi penyimpanan</span>
          <input name="lokasi" maxlength="60" value="${esc(item?.lokasi ?? '')}" placeholder="mis. Rak A1 (opsional)" /></label>
      </div>
      ${dipinjam ? `<div class="note warn"><i class="ri-information-line"></i><span>${dipinjam} unit sedang dipinjam, jadi stok minimal ${dipinjam}.</span></div>` : ''}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-close>Batal</button>
        <button type="submit" class="btn btn-primary">${item ? 'Simpan perubahan' : 'Tambah barang'}</button>
      </div>
    </form>`);

  const form = body.querySelector('#item-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const payload = { kode: f.kode, nama: f.nama, kategori: f.kategori, lokasi: f.lokasi, stok: Number(f.stok) };
    const btn = form.querySelector('[type=submit]');
    setLoading(btn, true, 'Menyimpan…');
    try {
      if (item) await api(`/items/${item.id}`, { method: 'PUT', body: payload });
      else await api('/items', { method: 'POST', body: payload });
      toast(item ? 'Perubahan barang disimpan.' : 'Barang ditambahkan.');
      closeModal();
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
      setLoading(btn, false);
    }
  };
}

async function deleteItem(item, onDone) {
  const borrowed = item.stok - item.tersedia;
  if (borrowed > 0) return toast(`${item.nama} tidak bisa dihapus, ${borrowed} unit masih dipinjam.`, 'error');
  const ok = await confirmDialog('Hapus barang?',
    `${tag(item.kode)} <b>${esc(item.nama)}</b> akan dihapus permanen. Riwayat transaksinya tetap tersimpan.`,
    'Hapus barang', true);
  if (!ok) return;
  try {
    await api(`/items/${item.id}`, { method: 'DELETE' });
    toast('Barang dihapus.');
    onDone();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function barang(el) {
  const admin = isAdmin();
  let items = (await api('/items')).items;

  el.innerHTML = `
    <div class="toolbar">
      <div class="search"><i class="ri-search-line"></i><input id="q" type="search" placeholder="Cari kode, nama, kategori, atau lokasi" aria-label="Cari barang" /></div>
      <select id="f-kat" aria-label="Filter kategori"></select>
      <select id="f-status" aria-label="Filter status">
        <option value="">Semua status</option>
        <option value="tersedia">Tersedia</option>
        <option value="menipis">Menipis</option>
        <option value="habis">Habis</option>
      </select>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Kode</th><th>Nama barang</th><th>Kategori</th><th>Stok</th><th>Tersedia</th><th>Dipinjam</th><th>Status</th>${admin ? '<th></th>' : ''}</tr></thead>
      <tbody id="tbody"></tbody>
    </table></div>
    <p class="table-foot" id="foot"></p>`;

  if (admin) {
    setActions(el, '<button class="btn btn-primary" id="add-item"><i class="ri-add-line"></i> Tambah barang</button>');
    $('#add-item').onclick = () => itemForm(null, items, reload);
  }

  const tbody = $('#tbody', el);
  function render() {
    const kw = $('#q', el).value.toLowerCase().trim();
    const kat = $('#f-kat', el).value;
    const st = $('#f-status', el).value;
    const rows = items.filter((i) =>
      (!kw || [i.kode, i.nama, i.kategori, i.lokasi].join(' ').toLowerCase().includes(kw)) &&
      (!kat || i.kategori === kat) && (!st || statusOf(i) === st));

    tbody.innerHTML = rows.length ? rows.map((i) => {
      const s = statusOf(i);
      const p = i.stok ? Math.round((i.tersedia / i.stok) * 100) : 0;
      return `<tr>
        <td>${tag(i.kode)}</td>
        <td><b>${esc(i.nama)}</b><small>${esc(i.lokasi || 'Lokasi belum diisi')}</small></td>
        <td>${esc(i.kategori)}</td>
        <td class="num">${i.stok}</td>
        <td><div class="stock"><b>${i.tersedia}</b><div class="meter"><div class="${meterClass(s)}" style="width:${p}%"></div></div></div></td>
        <td class="num">${i.stok - i.tersedia}</td>
        <td>${STOCK_BADGE[s]}</td>
        ${admin ? `<td><div class="actions">
          <button class="icon-btn" data-edit="${i.id}" aria-label="Ubah ${esc(i.nama)}"><i class="ri-pencil-line"></i></button>
          <button class="icon-btn danger" data-del="${i.id}" aria-label="Hapus ${esc(i.nama)}"><i class="ri-delete-bin-line"></i></button>
        </div></td>` : ''}
      </tr>`;
    }).join('') : `<tr><td colspan="${admin ? 8 : 7}">${emptyState('ri-search-line', 'Tidak ada barang yang cocok dengan pencarian.')}</td></tr>`;
    $('#foot', el).textContent = `Menampilkan ${rows.length} dari ${items.length} barang`;
  }

  function fillCategories() {
    const sel = $('#f-kat', el);
    const cur = sel.value;
    const cats = [...new Set(items.map((i) => i.kategori))].sort();
    sel.innerHTML = '<option value="">Semua kategori</option>' +
      cats.map((c) => `<option value="${esc(c)}" ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');
  }

  async function reload() {
    try {
      items = (await api('/items')).items;
      fillCategories();
      render();
    } catch (err) { toast(err.message, 'error'); }
  }

  $('#q', el).addEventListener('input', render);
  $('#f-kat', el).addEventListener('change', render);
  $('#f-status', el).addEventListener('change', render);
  if (admin) {
    tbody.addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit]');
      const del = e.target.closest('[data-del]');
      if (ed) itemForm(items.find((i) => String(i.id) === ed.dataset.edit), items, reload);
      if (del) deleteItem(items.find((i) => String(i.id) === del.dataset.del), reload);
    });
  }
  fillCategories();
  render();
}

/* =====================================================
   PEMINJAMAN
===================================================== */
async function peminjaman(el) {
  const [{ items }, { transactions }] = await Promise.all([
    api('/items'),
    api('/transactions?status=dipinjam&limit=8'),
  ]);
  const sorted = [...items].sort((a, b) => a.nama.localeCompare(b.nama));

  el.innerHTML = `
    <div class="split">
      <section class="panel">
        <div class="panel-head"><h2>Catat peminjaman baru</h2></div>
        <form class="form" id="loan-form">
          <label class="field"><span>Nama peminjam</span>
            <input name="peminjam" required maxlength="100" placeholder="Nama lengkap peminjam" /></label>
          <label class="field"><span>Barang</span>
            <select name="barang" required>
              <option value="">Pilih barang</option>
              ${sorted.map((i) => `<option value="${i.id}" ${i.tersedia === 0 ? 'disabled' : ''}>${esc(i.kode)}, ${esc(i.nama)} (${i.tersedia === 0 ? 'habis' : `${i.tersedia} tersedia`})</option>`).join('')}
            </select></label>
          <div id="preview"></div>
          <div class="grid-2">
            <label class="field"><span>Jumlah</span><input name="jumlah" type="number" min="1" value="1" required /></label>
            <label class="field"><span>Tanggal pinjam</span><input name="tanggal" type="date" required value="${todayISO()}" /></label>
          </div>
          <label class="field"><span>Keperluan</span>
            <textarea name="keterangan" maxlength="200" placeholder="mis. Praktikum Jaringan Komputer (opsional)"></textarea></label>
          <button class="btn btn-primary btn-block" type="submit">Simpan peminjaman</button>
        </form>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Peminjaman berjalan</h2><a href="#/pengembalian">Lihat semua</a></div>
        ${transactions.length ? transactions.map((t) => `
          <div class="loan-row">
            ${tag(t.kode)}
            <div><b>${esc(t.item_nama)} (${t.jumlah} unit)</b><small>${esc(t.peminjam)}, ${fmtDate(t.tanggal_pinjam)}</small></div>
            <span></span>
          </div>`).join('') : emptyState('ri-inbox-line', 'Belum ada peminjaman berjalan.')}
      </section>
    </div>`;

  const form = $('#loan-form', el);
  const sel = form.elements.barang;
  const jml = form.elements.jumlah;

  sel.addEventListener('change', () => {
    const it = items.find((i) => String(i.id) === sel.value);
    $('#preview', el).innerHTML = it ? `
      <div class="preview">
        <div>${tag(it.kode)} <b>${esc(it.nama)}</b><small class="muted">${esc(it.kategori)}, ${esc(it.lokasi || 'lokasi belum diisi')}</small></div>
        <span class="badge ${it.tersedia ? 'ok' : 'bad'}">${it.tersedia} dari ${it.stok} tersedia</span>
      </div>` : '';
    jml.max = it ? it.tersedia : '';
    if (it && Number(jml.value) > it.tersedia) jml.value = it.tersedia;
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const it = items.find((i) => String(i.id) === sel.value);
    const jumlah = Number(jml.value);
    if (!it) return toast('Pilih barang yang dipinjam.', 'error');
    if (jumlah > it.tersedia) return toast(`Stok ${it.nama} hanya ${it.tersedia} unit.`, 'error');

    const btn = form.querySelector('[type=submit]');
    setLoading(btn, true, 'Menyimpan…');
    try {
      const { transaction } = await api('/transactions', {
        method: 'POST',
        body: {
          item_id: it.id, jumlah,
          peminjam: form.elements.peminjam.value,
          tanggal: form.elements.tanggal.value,
          keterangan: form.elements.keterangan.value,
        },
      });
      toast(`Peminjaman ${transaction.kode} disimpan.`);
      await peminjaman(el);
    } catch (err) {
      toast(err.message, 'error');
      setLoading(btn, false);
    }
  };
}

/* =====================================================
   PENGEMBALIAN
===================================================== */
function returnModal(t, onDone) {
  const today = todayISO();
  const body = openModal('Proses pengembalian', `
    <div class="facts">
      <div><span>Kode transaksi</span>${tag(t.kode)}</div>
      <div><span>Peminjam</span><b>${esc(t.peminjam)}</b></div>
      <div><span>Barang</span><b>${esc(t.item_nama)} (${t.jumlah} unit)</b></div>
      <div><span>Tanggal pinjam</span><b>${fmtDate(t.tanggal_pinjam)}</b></div>
    </div>
    <form class="form" id="ret-form">
      <label class="field"><span>Tanggal kembali</span>
        <input type="date" name="tanggal" required min="${t.tanggal_pinjam}" value="${today < t.tanggal_pinjam ? t.tanggal_pinjam : today}" /></label>
      <div class="note ok"><i class="ri-information-line"></i><span>Stok ${esc(t.item_nama)} bertambah ${t.jumlah} unit dan transaksi ditandai selesai.</span></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-close>Batal</button>
        <button type="submit" class="btn btn-success">Tandai sudah kembali</button>
      </div>
    </form>`);

  const form = body.querySelector('#ret-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    setLoading(btn, true);
    try {
      await api(`/transactions/${t.id}/return`, { method: 'POST', body: { tanggal: form.elements.tanggal.value } });
      toast(`${t.kode} ditandai sudah kembali.`);
      closeModal();
      onDone();
    } catch (err) {
      toast(err.message, 'error');
      setLoading(btn, false);
    }
  };
}

async function pengembalian(el) {
  const { transactions } = await api('/transactions?status=dipinjam&limit=1000');
  const list = [...transactions].sort((a, b) => a.tanggal_pinjam.localeCompare(b.tanggal_pinjam));

  el.innerHTML = `
    <div class="toolbar">
      <div class="search"><i class="ri-search-line"></i><input id="q" type="search" placeholder="Cari peminjam, barang, atau kode transaksi" aria-label="Cari transaksi" /></div>
      <span class="pill">${list.length} belum dikembalikan</span>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Kode</th><th>Peminjam</th><th>Barang</th><th>Jumlah</th><th>Tanggal pinjam</th><th>Lama</th><th></th></tr></thead>
      <tbody id="tbody"></tbody>
    </table></div>`;

  const tbody = $('#tbody', el);
  function render() {
    const kw = $('#q', el).value.toLowerCase().trim();
    const rows = list.filter((t) => !kw || [t.kode, t.peminjam, t.item_nama, t.item_kode].join(' ').toLowerCase().includes(kw));
    tbody.innerHTML = rows.length ? rows.map((t) => {
      const days = daysSince(t.tanggal_pinjam);
      return `<tr>
        <td>${tag(t.kode)}</td>
        <td><b>${esc(t.peminjam)}</b><small>Dicatat oleh ${esc(t.dicatat_nama || '–')}</small></td>
        <td><b>${esc(t.item_nama)}</b><small>${esc(t.item_kode)}</small></td>
        <td class="num">${t.jumlah}</td>
        <td>${fmtDate(t.tanggal_pinjam)}</td>
        <td><span class="pill ${days > 7 ? 'late' : ''}">${days} hari</span></td>
        <td><div class="actions"><button class="btn btn-success sm" data-ret="${t.id}">Proses kembali</button></div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7">${emptyState('ri-checkbox-circle-line',
      list.length ? 'Tidak ada transaksi yang cocok.' : 'Semua barang sudah dikembalikan.')}</td></tr>`;
  }

  $('#q', el).addEventListener('input', render);
  tbody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ret]');
    if (b) returnModal(list.find((t) => String(t.id) === b.dataset.ret), () => pengembalian(el));
  });
  render();
}

/* =====================================================
   RIWAYAT TRANSAKSI
===================================================== */
function exportCSV(rows) {
  const head = ['Kode', 'Peminjam', 'Kode Barang', 'Nama Barang', 'Jumlah', 'Tanggal Pinjam', 'Tanggal Kembali', 'Status', 'Dicatat Oleh', 'Diterima Oleh', 'Keperluan'];
  const lines = rows.map((t) => [t.kode, t.peminjam, t.item_kode, t.item_nama, t.jumlah, t.tanggal_pinjam,
    t.tanggal_kembali || '', t.status, t.dicatat_nama || '', t.diterima_nama || '', t.keterangan || '']
    .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([`\ufeff${[head.join(','), ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `riwayat-transaksi-${todayISO()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function riwayat(el) {
  const admin = isAdmin();
  const { transactions: list } = await api('/transactions?limit=1000');
  let filtered = list;

  setActions(el, '<button class="btn btn-ghost" id="export"><i class="ri-download-2-line"></i> Unduh CSV</button>');
  $('#export').onclick = () => (filtered.length ? exportCSV(filtered) : toast('Tidak ada data untuk diunduh.', 'info'));

  el.innerHTML = `
    <div class="summary-row" id="summary"></div>
    <div class="toolbar">
      <div class="search"><i class="ri-search-line"></i><input id="q" type="search" placeholder="Cari kode, peminjam, atau barang" aria-label="Cari transaksi" /></div>
      <select id="f-status" aria-label="Filter status">
        <option value="">Semua status</option>
        <option value="dipinjam">Dipinjam</option>
        <option value="selesai">Selesai</option>
      </select>
      <input type="date" id="f-from" aria-label="Dari tanggal" title="Dari tanggal" />
      <input type="date" id="f-to" aria-label="Sampai tanggal" title="Sampai tanggal" />
      ${admin ? '' : '<label class="check"><input type="checkbox" id="f-mine" /> Hanya catatan saya</label>'}
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Kode</th><th>Peminjam</th><th>Barang</th><th>Jumlah</th><th>Pinjam</th><th>Kembali</th><th>Petugas</th><th>Status</th></tr></thead>
      <tbody id="tbody"></tbody>
    </table></div>
    <p class="table-foot" id="foot"></p>`;

  const tbody = $('#tbody', el);
  function render() {
    const kw = $('#q', el).value.toLowerCase().trim();
    const st = $('#f-status', el).value;
    const from = $('#f-from', el).value;
    const to = $('#f-to', el).value;
    const mine = $('#f-mine', el)?.checked;

    filtered = list.filter((t) =>
      (!kw || [t.kode, t.peminjam, t.item_nama, t.item_kode].join(' ').toLowerCase().includes(kw)) &&
      (!st || t.status === st) && (!from || t.tanggal_pinjam >= from) && (!to || t.tanggal_pinjam <= to) &&
      (!mine || t.dicatat_oleh === state.user.id || t.diterima_oleh === state.user.id));

    const box = (label, v) => `<div class="summary-box"><span>${label}</span><b>${v}</b></div>`;
    $('#summary', el).innerHTML = box('Transaksi', filtered.length) +
      box('Masih dipinjam', filtered.filter((t) => t.status === 'dipinjam').length) +
      box('Selesai', filtered.filter((t) => t.status === 'selesai').length);

    tbody.innerHTML = filtered.length ? filtered.map((t) => `
      <tr>
        <td>${tag(t.kode)}</td>
        <td><b>${esc(t.peminjam)}</b>${t.keterangan ? `<small>${esc(t.keterangan)}</small>` : ''}</td>
        <td><b>${esc(t.item_nama)}</b><small>${esc(t.item_kode)}</small></td>
        <td class="num">${t.jumlah}</td>
        <td>${fmtDate(t.tanggal_pinjam)}</td>
        <td>${fmtDate(t.tanggal_kembali)}</td>
        <td><small>Dicatat: ${esc(t.dicatat_nama || '–')}</small><small>Diterima: ${esc(t.diterima_nama || '–')}</small></td>
        <td>${trxBadge(t.status)}</td>
      </tr>`).join('') : `<tr><td colspan="8">${emptyState('ri-history-line', 'Tidak ada transaksi pada filter ini.')}</td></tr>`;
    $('#foot', el).textContent = `Menampilkan ${filtered.length} dari ${list.length} transaksi`;
  }

  $('#q', el).addEventListener('input', render);
  ['#f-status', '#f-from', '#f-to', '#f-mine'].forEach((s) => $(s, el)?.addEventListener('change', render));
  render();
}

/* =====================================================
   PENGGUNA (ADMIN)
===================================================== */
function userForm(user, onDone) {
  const editing = !!user;
  const body = openModal(editing ? 'Ubah pengguna' : 'Tambah akun Staff', `
    <form class="form" id="user-form">
      <label class="field"><span>Nama lengkap</span>
        <input name="full_name" required maxlength="100" value="${esc(user?.full_name ?? '')}" placeholder="mis. Budi Santoso" /></label>
      <label class="field"><span>Username</span>
        ${editing
          ? `<input value="${esc(user.username)}" readonly /><small>Username dipakai untuk login dan tidak dapat diubah.</small>`
          : '<input name="username" required pattern="[a-zA-Z0-9_.]{3,30}" title="3–30 karakter: huruf, angka, titik, atau garis bawah" placeholder="mis. budi" />'}
      </label>
      <label class="field"><span>${editing ? 'Password baru' : 'Password'}</span>
        <input name="password" type="password" minlength="6" ${editing ? '' : 'required'} autocomplete="new-password"
          placeholder="${editing ? 'Kosongkan jika tidak diganti' : 'Minimal 6 karakter'}" /></label>
      ${editing ? '' : '<div class="note"><i class="ri-information-line"></i><span>Akun baru langsung aktif dengan role Staff.</span></div>'}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-close>Batal</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Simpan perubahan' : 'Buat akun'}</button>
      </div>
    </form>`);

  const form = body.querySelector('#user-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('[type=submit]');
    setLoading(btn, true, 'Menyimpan…');
    try {
      if (editing) {
        const { user: updated } = await api(`/users/${user.id}`, { method: 'PUT', body: { full_name: f.full_name, password: f.password } });
        if (updated.id === state.user.id) {
          state.user.full_name = updated.full_name;
          $('#user-name').textContent = updated.full_name;
        }
        toast('Data pengguna disimpan.');
      } else {
        await api('/users', { method: 'POST', body: f });
        toast(`Akun @${f.username.toLowerCase()} dibuat.`);
      }
      closeModal();
      onDone();
    } catch (err) {
      toast(err.message, 'error');
      setLoading(btn, false);
    }
  };
}

async function pengguna(el) {
  let users = (await api('/users')).users;

  setActions(el, '<button class="btn btn-primary" id="add-user"><i class="ri-user-add-line"></i> Tambah Staff</button>');
  $('#add-user').onclick = () => userForm(null, reload);

  el.innerHTML = `
    <div class="summary-row" id="summary"></div>
    <div class="toolbar">
      <div class="search"><i class="ri-search-line"></i><input id="q" type="search" placeholder="Cari nama atau username" aria-label="Cari pengguna" /></div>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Pengguna</th><th>Role</th><th>Status akun</th><th>Dibuat</th><th></th></tr></thead>
      <tbody id="tbody"></tbody>
    </table></div>`;

  const tbody = $('#tbody', el);
  function render() {
    const kw = $('#q', el).value.toLowerCase().trim();
    const staff = users.filter((u) => u.role === 'staff');
    const box = (label, v) => `<div class="summary-box"><span>${label}</span><b>${v}</b></div>`;
    $('#summary', el).innerHTML = box('Total pengguna', users.length) +
      box('Staff aktif', staff.filter((u) => u.is_active).length) +
      box('Staff nonaktif', staff.filter((u) => !u.is_active).length);

    const rows = users.filter((u) => !kw || `${u.full_name} ${u.username}`.toLowerCase().includes(kw));
    tbody.innerHTML = rows.length ? rows.map((u) => `
      <tr>
        <td><div class="person"><span class="avatar">${esc(u.full_name.charAt(0).toUpperCase())}</span>
          <div><b>${esc(u.full_name)}${u.id === state.user.id ? ' <span class="pill">Anda</span>' : ''}</b><small>@${esc(u.username)}</small></div></div></td>
        <td>${u.role === 'admin' ? '<span class="badge dark">Admin</span>' : '<span class="badge info">Staff</span>'}</td>
        <td><div class="status-cell">
          ${u.role === 'staff' ? `<label class="switch"><input type="checkbox" data-toggle="${u.id}" ${u.is_active ? 'checked' : ''} aria-label="Status akun ${esc(u.username)}" /><span></span></label>` : ''}
          <span class="badge ${u.is_active ? 'ok' : 'bad'}">${u.is_active ? 'Aktif' : 'Nonaktif'}</span>
        </div></td>
        <td>${fmtDate(u.created_at)}</td>
        <td><div class="actions"><button class="icon-btn" data-edit="${u.id}" aria-label="Ubah ${esc(u.username)}"><i class="ri-pencil-line"></i></button></div></td>
      </tr>`).join('') : `<tr><td colspan="5">${emptyState('ri-user-search-line', 'Tidak ada pengguna yang cocok.')}</td></tr>`;
  }

  async function reload() {
    try {
      users = (await api('/users')).users;
      render();
    } catch (err) { toast(err.message, 'error'); }
  }

  $('#q', el).addEventListener('input', render);
  tbody.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) userForm(users.find((u) => String(u.id) === ed.dataset.edit), reload);
  });
  tbody.addEventListener('change', async (e) => {
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    const u = users.find((x) => String(x.id) === t.dataset.toggle);
    const active = t.checked;
    t.disabled = true;
    try {
      await api(`/users/${u.id}/status`, { method: 'PATCH', body: { is_active: active } });
      toast(`Akun ${u.full_name} ${active ? 'diaktifkan' : 'dinonaktifkan'}.`, active ? 'success' : 'info');
      await reload();
    } catch (err) {
      t.checked = !active;
      t.disabled = false;
      toast(err.message, 'error');
    }
  });
  render();
}

export const pages = { dashboard, barang, peminjaman, pengembalian, riwayat, pengguna };
