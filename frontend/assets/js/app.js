/**
 * app.js — RumahDrive
 * Semua fungsi API dari api.js sekarang digunakan:
 *  - apiListFiles        → loadFiles()
 *  - apiUploadFile       → handleFileUpload()
 *  - apiCreateFolder     → confirmCreateFolder()
 *  - apiGetFolder        → openFolderDetail()       ← BARU
 *  - apiRenameFolder     → confirmRename() [folder] ← BARU
 *  - apimoveFolder       → confirmMove()            ← BARU
 *  - apiDeleteFolder     → confirmDelete() [folder] ← BARU
 *  - apiDeleteItem       → confirmDelete() [file]
 *  - apiDownloadUrl      → triggerDownload(), openPreview()
 *  - apiGetStorageInfo   → loadStorageInfo()
 *  - apiRenameFile (PUT) → confirmRename() [file]   ← BARU
 */

// import { API_BASE } from "./api.js"

/* ================================================================== */
/*  STATE                                                              */
/* ================================================================== */
const state = {
  currentPath: '/',
  items: [],
  viewMode: 'grid',           // 'grid' | 'list'
  pendingDelete: null,           // { id, name, type }
  pendingRename: null,           // { id, name, type }
  pendingMove: null,           // { id, name }
  openCtxMenu: null,           // elemen .ctx-menu yang sedang terbuka
};

/* ================================================================== */
/*  ELEMEN DOM                                                         */
/* ================================================================== */
const $ = (sel) => document.querySelector(sel);

const el = {
  fileGrid: $('#fileGrid'),
  skeletonGrid: $('#skeletonGrid'),
  emptyState: $('#emptyState'),
  errorState: $('#errorState'),
  errorMessage: $('#errorMessage'),
  breadcrumb: $('#breadcrumb'),
  storageBadge: $('#storageBadge').querySelector('.storage-label'),

  btnUpload: $('#btnUpload'),
  fileInput: $('#fileInput'),
  fabUpload: $('#fabUpload'),
  btnNewFolder: $('#btnNewFolder'),
  btnViewToggle: $('#btnViewToggle'),
  btnRefresh: $('#btnRefresh'),
  btnRetry: $('#btnRetry'),

  uploadProgressArea: $('#uploadProgressArea'),
  uploadProgressList: $('#uploadProgressList'),
  btnCancelAll: $('#btnCancelAll'),

  dropOverlay: $('#dropOverlay'),

  // Modal: buat folder
  modalNewFolder: $('#modalNewFolder'),
  folderNameInput: $('#folderNameInput'),
  folderNameError: $('#folderNameError'),
  btnConfirmFolder: $('#btnConfirmFolder'),
  btnCancelFolder: $('#btnCancelFolder'),

  // Modal: rename
  modalRename: $('#modalRename'),
  renameCurrentName: $('#renameCurrentName'),
  renameInput: $('#renameInput'),
  renameError: $('#renameError'),
  btnConfirmRename: $('#btnConfirmRename'),
  btnCancelRename: $('#btnCancelRename'),

  // Modal: detail folder
  modalFolderDetail: $('#modalFolderDetail'),
  detailGrid: $('#detailGrid'),
  btnCloseDetail: $('#btnCloseDetail'),

  // Modal: pindahkan folder
  modalMove: $('#modalMove'),
  moveItemName: $('#moveItemName'),
  moveDestInput: $('#moveDestInput'),
  moveError: $('#moveError'),
  btnConfirmMove: $('#btnConfirmMove'),
  btnCancelMove: $('#btnCancelMove'),

  // Modal: hapus
  modalDelete: $('#modalDelete'),
  deleteItemName: $('#deleteItemName'),
  btnConfirmDelete: $('#btnConfirmDelete'),
  btnCancelDelete: $('#btnCancelDelete'),

  // Modal: preview
  modalPreview: $('#modalPreview'),
  previewFilename: $('#previewFilename'),
  previewBody: $('#previewBody'),
  btnClosePreview: $('#btnClosePreview'),
  btnDownloadPreview: $('#btnDownloadPreview'),

  btnLogout: $('#btnLogout'),
  userBadge: $('#userBadge'),

  toastContainer: $('#toastContainer'),
};

// Tampilkan nama user yang sedang login (disimpan login.js saat login berhasil)
(function showLoggedInUser() {
  try {
    const raw = localStorage.getItem('rumahdrive_user');
    if (!raw || !el.userBadge) return;
    const user = JSON.parse(raw);
    if (!user || !user.nama) return;
    el.userBadge.innerHTML = `Halo, <strong>${user.nama}</strong>`;
    el.userBadge.hidden = false;
  } catch (_) {
    // abaikan jika data tersimpan rusak
  }
})();

/* ================================================================== */
/*  UTILITAS                                                           */
/* ================================================================== */

function formatSize(bytes) {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function getIcon(item) {
  if (item.type === 'folder') return '📁';
  const m = item.mime_type || '';
  if (m.startsWith('image/')) return '🖼️';
  if (m.startsWith('video/')) return '🎬';
  if (m.startsWith('audio/')) return '🎵';
  if (m === 'application/pdf') return '📄';
  if (m.includes('word') || m.includes('document')) return '📝';
  if (m.includes('sheet') || m.includes('excel')) return '📊';
  if (m.includes('zip') || m.includes('rar') || m.includes('compressed')) return '🗜️';
  if (m.startsWith('text/')) return '📃';
  return '📦';
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ================================================================== */
/*  TOAST                                                              */
/* ================================================================== */
function showToast(msg, type = 'info', durationMs = 3000) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${msg}</span>`;
  el.toastContainer.prepend(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, durationMs);
}

/* ================================================================== */
/*  CONTEXT MENU (menu ⋮ per kartu)                                   */
/* ================================================================== */

function closeCtxMenu() {
  if (state.openCtxMenu) {
    state.openCtxMenu.remove();
    state.openCtxMenu = null;
  }
}

/**
 * FIX: ctx-menu di-append ke document.body dengan posisi absolut
 * berdasarkan posisi tombol ⋮, sehingga tidak terpotong oleh
 * overflow:hidden di .file-card maupun .file-grid.
 *
 * Folder: Detail, Rename, Pindahkan, Hapus
 * File  : Download, Rename, Hapus
 */
function openCtxMenu(item, triggerEl) {
  closeCtxMenu();

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';

  const actions = item.type === 'folder'
    ? [
      { label: '📋 Detail Folder', fn: () => openFolderDetail(item) },
      { label: '✏️ Ganti Nama', fn: () => openRenameModal(item) },
      { label: '📦 Pindahkan', fn: () => openMoveModal(item) },
      { divider: true },
      { label: '🗑 Hapus Folder', fn: () => openDeleteModal(item), danger: true },
    ]
    : [
      { label: '⬇ Download', fn: () => triggerDownload(item) },
      { label: '✏️ Ganti Nama', fn: () => openRenameModal(item) },
      { divider: true },
      { label: '🗑 Hapus File', fn: () => openDeleteModal(item), danger: true },
    ];

  actions.forEach((a) => {
    if (a.divider) {
      const d = document.createElement('div');
      d.className = 'ctx-divider';
      menu.appendChild(d);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'ctx-item' + (a.danger ? ' danger' : '');
    btn.textContent = a.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCtxMenu();
      a.fn();
    });
    menu.appendChild(btn);
  });

  // Posisikan relatif terhadap tombol ⋮, bukan di dalam kartu
  menu.style.position = 'fixed';
  menu.style.zIndex = '1000';
  document.body.appendChild(menu);

  // Hitung posisi setelah masuk DOM (agar offsetWidth/Height tersedia)
  requestAnimationFrame(() => {
    const rect = triggerEl.getBoundingClientRect();
    const menuW = menu.offsetWidth || 170;
    const menuH = menu.offsetHeight || 160;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    // Tampilkan di bawah tombol, geser ke kiri jika terlalu dekat tepi kanan
    let top = rect.bottom + 6;
    let left = rect.right - menuW;

    // Jangan sampai keluar layar bawah → tampilkan di atas tombol
    if (top + menuH > vpH - 8) top = rect.top - menuH - 6;
    // Jangan sampai keluar layar kiri
    if (left < 8) left = 8;
    // Jangan sampai keluar layar kanan
    if (left + menuW > vpW - 8) left = vpW - menuW - 8;

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  });

  state.openCtxMenu = menu;
}

// Klik di luar menutup ctx menu
document.addEventListener('click', () => closeCtxMenu());

/* ================================================================== */
/*  RENDER KARTU                                                       */
/* ================================================================== */

function showSkeleton() {
  el.skeletonGrid.hidden = false;
  el.fileGrid.hidden = true;
  el.emptyState.hidden = true;
  el.errorState.hidden = true;
}

function showError(msg) {
  el.skeletonGrid.hidden = true;
  el.fileGrid.hidden = true;
  el.emptyState.hidden = true;
  el.errorState.hidden = false;
  el.errorMessage.textContent = msg || 'Pastikan server FastAPI sudah berjalan.';
}

function renderItems(items) {
  el.skeletonGrid.hidden = true;
  el.errorState.hidden = true;

  if (!items.length) {
    el.fileGrid.hidden = true;
    el.emptyState.hidden = false;
    return;
  }

  el.emptyState.hidden = true;
  el.fileGrid.hidden = false;
  el.fileGrid.innerHTML = '';

  const sorted = [...items].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name, 'id');
    return a.type === 'folder' ? -1 : 1;
  });

  sorted.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.style.animationDelay = `${idx * 30}ms`;
    card.dataset.id = item.id;
    card.dataset.type = item.type;

    const iconHtml = item.thumbnail_url
      ? `<img src="${item.thumbnail_url}" class="file-icon" alt="${item.name}"
            style="width:64px;height:64px;object-fit:cover;border-radius:8px;" loading="lazy" />`
      : `<span class="file-icon">${getIcon(item)}</span>`;

    const metaLabel = item.type === 'folder'
      ? `Folder · ${item.item_count ?? 0} item`
      : formatSize(item.size_bytes);

    card.innerHTML = `
      ${iconHtml}
      <span class="file-name" title="${item.name}">${item.name}</span>
      <span class="file-meta">${metaLabel}</span>
      <div class="file-card-actions">
        ${item.type === 'file'
        ? `<button class="btn-card-action download" title="Download" aria-label="Download ${item.name}">⬇</button>`
        : ''}
        <button class="btn-card-menu" title="Opsi lainnya" aria-label="Menu ${item.name}">⋮</button>
        <button class="btn-card-action delete" title="Hapus" aria-label="Hapus ${item.name}">🗑</button>
      </div>
    `;

    // Kalau thumbnail gagal dimuat (file rusak/terhapus/404, dsb), jangan biarkan
    // browser nampilin ikon gambar-rusak + teks nama numpuk berantakan —
    // ganti otomatis ke ikon jenis file biasa.
    if (item.thumbnail_url) {
      const thumbEl = card.querySelector('.file-icon');
      thumbEl.addEventListener('error', () => {
        const fallback = document.createElement('span');
        fallback.className = 'file-icon';
        fallback.textContent = getIcon(item);
        thumbEl.replaceWith(fallback);
      }, { once: true });
    }

    // Klik utama: buka folder atau preview file
    card.addEventListener('click', (e) => {
      if (e.target.closest('.file-card-actions')) return;
      closeCtxMenu();
      if (item.type === 'folder') navigateTo(item.path);
      else openPreview(item);
    });

    // Tombol download (file saja)
    const btnDl = card.querySelector('.btn-card-action.download');
    if (btnDl) btnDl.addEventListener('click', (e) => { e.stopPropagation(); triggerDownload(item); });

    // Tombol ⋮ menu — FIX: kirim btnMenu sebagai triggerEl untuk posisi absolut
    const btnMenu = card.querySelector('.btn-card-menu');
    btnMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      openCtxMenu(item, btnMenu);
    });

    // Tombol hapus cepat
    const btnDel = card.querySelector('.btn-card-action.delete');
    btnDel.addEventListener('click', (e) => { e.stopPropagation(); openDeleteModal(item); });

    el.fileGrid.appendChild(card);
  });
}

/* ================================================================== */
/*  NAVIGASI FOLDER                                                    */
/* ================================================================== */

function navigateTo(path) {
  state.currentPath = path;
  // FIX: simpan path ke localStorage agar tidak hilang saat refresh
  try { localStorage.setItem('rd_path', path); } catch (_) { }
  updateBreadcrumb(path);
  loadFiles(path);
}

function updateBreadcrumb(path) {
  el.breadcrumb.innerHTML = '';
  const parts = path.split('/').filter(Boolean);
  const crumbs = [{ label: '📁 Beranda', path: '/' }];
  parts.forEach((part, i) => {
    crumbs.push({ label: part, path: '/' + parts.slice(0, i + 1).join('/') });
  });
  crumbs.forEach((crumb, i) => {
    const btn = document.createElement('button');
    btn.className = 'crumb' + (i === crumbs.length - 1 ? ' active' : '');
    btn.dataset.path = crumb.path;
    btn.textContent = crumb.label;
    btn.addEventListener('click', () => {
      if (crumb.path !== state.currentPath) navigateTo(crumb.path);
    });
    el.breadcrumb.appendChild(btn);
  });
}

/* ================================================================== */
/*  MUAT FILE — apiListFiles                                           */
/* ================================================================== */

async function loadFiles(path = state.currentPath) {
  showSkeleton();
  try {
    const data = await apiListFiles(path);
    state.items = data.items || [];
    renderItems(state.items);
    updateStorageBadge(data.used_size_bytes, data.total_size_bytes);
  } catch (err) {
    console.error('[RumahDrive] loadFiles error:', err);
    showError(err.message);
  }
}

/* ================================================================== */
/*  STORAGE BADGE — apiGetStorageInfo                                  */
/* ================================================================== */

function updateStorageBadge(used, total) {
  if (used == null || total == null) return;
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  el.storageBadge.textContent = `${formatSize(used)} / ${formatSize(total)} (${pct}%)`;
}

async function loadStorageInfo() {
  try {
    const info = await apiGetStorageInfo();
    updateStorageBadge(info.used_bytes, info.total_bytes);
  } catch (_) { /* tidak kritis */ }
}

/* ================================================================== */
/*  UPLOAD FILE — apiUploadFile                                        */
/* ================================================================== */

async function handleFileUpload(files) {
  if (!files || !files.length) return;
  el.uploadProgressArea.hidden = false;

  const tasks = Array.from(files).map((file) => {
    const item = document.createElement('div');
    item.className = 'progress-item';
    item.innerHTML = `
      <span class="progress-item-name" title="${file.name}">${file.name}</span>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:0%"></div></div>
      <span class="progress-status">0%</span>
    `;
    el.uploadProgressList.appendChild(item);
    const barFill = item.querySelector('.progress-bar-fill');
    const statusEl = item.querySelector('.progress-status');

    return apiUploadFile(file, state.currentPath, (pct) => {
      barFill.style.width = `${pct}%`;
      statusEl.textContent = `${pct}%`;
    })
      .then(() => { barFill.style.width = '100%'; statusEl.textContent = '✓'; statusEl.classList.add('done'); })
      .catch((err) => { statusEl.textContent = '✗'; statusEl.classList.add('error'); console.error(err); });
  });

  await Promise.all(tasks);
  showToast(`${files.length} file diproses.`, 'success');
  await loadFiles();
  setTimeout(() => {
    el.uploadProgressArea.hidden = true;
    el.uploadProgressList.innerHTML = '';
  }, 2000);
}

/* ================================================================== */
/*  BUAT FOLDER — apiCreateFolder                                      */
/* ================================================================== */

function openNewFolderModal() {
  el.folderNameInput.value = '';
  el.folderNameError.hidden = true;
  el.folderNameInput.classList.remove('error');
  el.modalNewFolder.hidden = false;
  setTimeout(() => el.folderNameInput.focus(), 50);
}
function closeNewFolderModal() { el.modalNewFolder.hidden = true; }

async function confirmCreateFolder() {
  const name = el.folderNameInput.value.trim();
  if (!name) return showInputError(el.folderNameInput, el.folderNameError, 'Nama folder tidak boleh kosong.');
  if (/[<>:"/\\|?*]/.test(name)) return showInputError(el.folderNameInput, el.folderNameError, 'Nama mengandung karakter tidak valid.');

  setLoading(el.btnConfirmFolder, true, 'Buat');
  try {
    await apiCreateFolder(name, state.currentPath);
    closeNewFolderModal();
    showToast(`Folder "${name}" dibuat.`, 'success');
    await loadFiles();
  } catch (err) {
    showInputError(el.folderNameInput, el.folderNameError, err.message);
  } finally {
    setLoading(el.btnConfirmFolder, false, 'Buat');
  }
}

/* ================================================================== */
/*  DETAIL FOLDER — apiGetFolder                                       */
/* ================================================================== */

async function openFolderDetail(item) {
  el.detailGrid.innerHTML = `<span class="detail-label">Memuat…</span><span></span>`;
  el.modalFolderDetail.hidden = false;

  try {
    const detail = await apiGetFolder(item.id);
    el.detailGrid.innerHTML = `
      <span class="detail-label">Nama</span>
      <span class="detail-value">${detail.name}</span>

      <span class="detail-label">Path</span>
      <span class="detail-value">${detail.path}</span>

      <span class="detail-label">Induk</span>
      <span class="detail-value">${detail.parent_path ?? '/'}</span>

      <span class="detail-label">Jumlah item</span>
      <span class="detail-value">${detail.item_count ?? 0} item</span>

      <span class="detail-label">Ukuran total</span>
      <span class="detail-value">${formatSize(detail.size_bytes)}</span>

      <span class="detail-label">Dibuat</span>
      <span class="detail-value">${formatDate(detail.created_at)}</span>

      <span class="detail-label">Diubah</span>
      <span class="detail-value">${formatDate(detail.modified_at)}</span>
    `;
  } catch (err) {
    el.detailGrid.innerHTML = `<span class="detail-label" style="color:var(--danger)">Gagal memuat detail: ${err.message}</span><span></span>`;
  }
}

function closeFolderDetail() { el.modalFolderDetail.hidden = true; }

/* ================================================================== */
/*  GANTI NAMA — apiRenameFolder / apiRenameFile                       */
/* ================================================================== */

function openRenameModal(item) {
  state.pendingRename = { id: item.id, name: item.name, type: item.type };
  el.renameCurrentName.textContent = `Nama sekarang: "${item.name}"`;
  el.renameInput.value = item.name;
  el.renameError.hidden = true;
  el.renameInput.classList.remove('error');
  el.modalRename.hidden = false;
  setTimeout(() => { el.renameInput.focus(); el.renameInput.select(); }, 50);
}
function closeRenameModal() { el.modalRename.hidden = true; state.pendingRename = null; }

async function confirmRename() {
  if (!state.pendingRename) return;
  const { id, type } = state.pendingRename;
  const newName = el.renameInput.value.trim();

  if (!newName) return showInputError(el.renameInput, el.renameError, 'Nama tidak boleh kosong.');
  if (/[<>:"/\\|?*]/.test(newName)) return showInputError(el.renameInput, el.renameError, 'Nama mengandung karakter tidak valid.');

  setLoading(el.btnConfirmRename, true, 'Simpan');
  try {
    // Pilih fungsi API sesuai tipe item
    if (type === 'folder') {
      await apiRenameFolder(id, newName);
    } else {
      await apiRenameFile(id, newName);
    }
    closeRenameModal();
    showToast(`Berhasil diganti nama menjadi "${newName}".`, 'success');
    await loadFiles();
  } catch (err) {
    showInputError(el.renameInput, el.renameError, err.message);
  } finally {
    setLoading(el.btnConfirmRename, false, 'Simpan');
  }
}

/* ================================================================== */
/*  PINDAHKAN FOLDER — apimoveFolder                                   */
/* ================================================================== */

function openMoveModal(item) {
  state.pendingMove = { id: item.id, name: item.name };
  el.moveItemName.textContent = `"${item.name}"`;
  el.moveDestInput.value = state.currentPath;
  el.moveError.hidden = true;
  el.modalMove.hidden = false;
  setTimeout(() => { el.moveDestInput.focus(); el.moveDestInput.select(); }, 50);
}
function closeMoveModal() { el.modalMove.hidden = true; state.pendingMove = null; }

async function confirmMove() {
  if (!state.pendingMove) return;
  const { id, name } = state.pendingMove;
  const dest = el.moveDestInput.value.trim();

  if (!dest) return showInputError(el.moveDestInput, el.moveError, 'Path tujuan tidak boleh kosong.');
  if (dest === state.currentPath) return showInputError(el.moveDestInput, el.moveError, 'Tujuan sama dengan lokasi sekarang.');

  setLoading(el.btnConfirmMove, true, 'Pindahkan');
  try {
    await apimoveFolder(id, dest);
    closeMoveModal();
    showToast(`"${name}" dipindahkan ke ${dest}.`, 'success');
    await loadFiles();
  } catch (err) {
    showInputError(el.moveDestInput, el.moveError, err.message);
  } finally {
    setLoading(el.btnConfirmMove, false, 'Pindahkan');
  }
}

/* ================================================================== */
/*  HAPUS — apiDeleteItem / apiDeleteFolder                            */
/* ================================================================== */

function openDeleteModal(item) {
  state.pendingDelete = { id: item.id, name: item.name, type: item.type };
  el.deleteItemName.textContent = `"${item.name}"`;
  el.modalDelete.hidden = false;
}
function closeDeleteModal() { el.modalDelete.hidden = true; state.pendingDelete = null; }

async function confirmDelete() {
  if (!state.pendingDelete) return;
  const { id, name, type } = state.pendingDelete;

  setLoading(el.btnConfirmDelete, true, 'Hapus');
  try {
    // Gunakan endpoint yang sesuai tipe
    if (type === 'folder') {
      await apiDeleteFolder(id);
    } else {
      await apiDeleteItem(id);
    }
    closeDeleteModal();
    showToast(`"${name}" berhasil dihapus.`, 'success');
    await loadFiles();
  } catch (err) {
    showToast(`Gagal menghapus: ${err.message}`, 'error');
  } finally {
    setLoading(el.btnConfirmDelete, false, 'Hapus');
  }
}

/* ================================================================== */
/*  DOWNLOAD — apiDownloadUrl                                          */
/* ================================================================== */

function triggerDownload(item) {
  const a = document.createElement('a');
  a.href = apiDownloadUrl(item.id);
  a.download = item.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ================================================================== */
/*  PREVIEW FILE (UPDATE DENGAN DOCX & SHEETJS)                        */
/* ================================================================== */

// Render PDF memakai PDF.js ke <canvas>, discale otomatis mengikuti lebar
// layar (device) sehingga tidak ada bagian yang terpotong di mobile —
// berbeda dengan <iframe> yang memakai PDF viewer bawaan browser (yang
// seringkali membuka dengan zoom tetap dan memotong sisi kiri/atas di HP).
async function renderPdfPreview(url, container) {
  if (!window.pdfjsLib) {
    container.innerHTML = `
      <div class="preview-fallback">
        <span class="big-icon">📄</span>
        <p>Preview PDF tidak tersedia di perangkat ini.</p>
      </div>`;
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'pdf-viewer';
  container.appendChild(wrapper);

  const pdf = await pdfjsLib.getDocument(url).promise;
  const outputScale = window.devicePixelRatio || 1;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    // Lebar wrapper (dikurangi padding preview-body) dipakai sebagai acuan,
    // supaya halaman PDF selalu pas dengan lebar layar—termasuk HP kecil.
    const targetWidth = wrapper.clientWidth || container.clientWidth || 320;
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page';
    const ctx = canvas.getContext('2d');
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    wrapper.appendChild(canvas);

    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
    await page.render({ canvasContext: ctx, viewport, transform }).promise;
  }
}

async function openPreview(item) {
  el.previewFilename.textContent = item.name;

  // URL untuk tombol download paksa (attachment)
  el.btnDownloadPreview.href = apiDownloadUrl(item.id, false);
  el.btnDownloadPreview.download = item.name;

  // Tampilkan modal dan set status loading
  el.previewBody.className = 'preview-body'; // reset mode dari preview sebelumnya (mis. pdf-mode)
  el.previewBody.innerHTML = `
    <div class="preview-fallback" style="color:var(--text-1);">
       <span style="font-size: 2rem;">⏳</span>
       <p style="margin-top: 10px;">Memuat file...</p>
    </div>`;
  el.modalPreview.hidden = false;

  const m = item.mime_type || '';
  // URL untuk dibaca/ditampilkan di layar (inline)
  const src = apiDownloadUrl(item.id, true);
  const nameLower = item.name.toLowerCase();

  try {
    if (m.startsWith('image/')) {
      el.previewBody.innerHTML = '';
      const img = document.createElement('img');
      img.src = src; img.alt = item.name;
      el.previewBody.appendChild(img);

    } else if (m.startsWith('video/')) {
      el.previewBody.innerHTML = '';
      const vid = document.createElement('video');
      vid.src = src; vid.controls = true;
      el.previewBody.appendChild(vid);

    } else if (m.startsWith('audio/')) {
      el.previewBody.innerHTML = '';
      const aud = document.createElement('audio');
      aud.src = src; aud.controls = true;
      el.previewBody.appendChild(aud);

    } else if (m === 'application/pdf') {
      el.previewBody.innerHTML = '';
      el.previewBody.classList.add('pdf-mode');
      await renderPdfPreview(src, el.previewBody);

    }
    // ======= PREVIEW WORD (.DOCX) =======
    else if (nameLower.endsWith('.docx')) {
      const res = await fetch(src);
      if (!res.ok) throw new Error('Gagal mengambil file Word');
      const blob = await res.blob();

      el.previewBody.innerHTML = '';

      const container = document.createElement('div');
      // Berikan style agar bisa di-scroll secara independen jika tetap melebihi layar
      container.style.cssText = 'width: 100%; height: 100%; overflow: auto; background: #e5e7eb; border-radius: 8px;';
      el.previewBody.appendChild(container);

      // Opsi untuk docx-preview
      const docxOptions = {
        className: 'docx',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true
      };

      await docx.renderAsync(blob, container, null, docxOptions);
    }
    // ======= PREVIEW EXCEL (.XLSX / .CSV) =======
    else if (nameLower.endsWith('.xlsx') || nameLower.endsWith('.csv')) {
      const res = await fetch(src);
      if (!res.ok) throw new Error('Gagal mengambil file Excel');
      const arrayBuffer = await res.arrayBuffer();

      el.previewBody.innerHTML = ''; // Hapus loading

      // Baca file dengan SheetJS
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      // Ambil sheet (halaman) pertama saja
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Ubah sheet menjadi format HTML Tabel
      const htmlStr = XLSX.utils.sheet_to_html(worksheet);

      const container = document.createElement('div');
      container.style.cssText = 'width:100%; height:100%; overflow:auto; background:#fff; padding:16px; border-radius:8px; color: black;';
      container.innerHTML = htmlStr;

      // Sisipkan sedikit CSS untuk mempercantik tabel excel bawaan SheetJS
      const style = document.createElement('style');
      style.innerHTML = `
        .preview-body table { border-collapse: collapse; width: max-content; min-width: 100%; }
        .preview-body th, .preview-body td { border: 1px solid #ccc; padding: 6px 10px; font-size: 13px; font-family: sans-serif; white-space: nowrap; }
        .preview-body tr:first-child { font-weight: bold; background-color: #f3f3f3; }
        .preview-body td[data-t="n"] { text-align: right; }
      `;
      container.prepend(style);

      el.previewBody.appendChild(container);

    } else {
      // Fallback untuk PPTX atau tipe lain yang tidak didukung
      el.previewBody.innerHTML = `
        <div class="preview-fallback">
          <span class="big-icon">${getIcon(item)}</span>
          <p>Preview tidak tersedia untuk tipe ini.</p>
          <p style="font-size:.75rem;margin-top:4px">${m || 'Silakan klik tombol download di bawah.'}</p>
        </div>`;
    }
  } catch (error) {
    console.error(error);
    el.previewBody.innerHTML = `
      <div class="preview-fallback">
        <span class="big-icon" style="color: var(--danger);">⚠️</span>
        <p>Gagal memuat pratinjau</p>
        <p style="font-size:.75rem;margin-top:4px;color:var(--text-3);">${error.message}</p>
      </div>`;
  }
}

function closePreview() {
  el.modalPreview.hidden = true;
  const media = el.previewBody.querySelector('video, audio');
  if (media) { media.pause(); media.src = ''; }
  el.previewBody.innerHTML = '';
  el.previewBody.className = 'preview-body';
}

/* ================================================================== */
/*  VIEW TOGGLE                                                        */
/* ================================================================== */

function toggleViewMode() {
  state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
  el.fileGrid.classList.toggle('list-view', state.viewMode === 'list');
  el.btnViewToggle.textContent = state.viewMode === 'grid' ? '⊞' : '☰';
}

/* ================================================================== */
/*  DRAG & DROP                                                        */
/* ================================================================== */

let dragCounter = 0;

function isDraggingFiles(e) {
  return e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
}

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (!isDraggingFiles(e)) return;
  dragCounter++;
  el.dropOverlay.classList.add('visible');
});
document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  if (--dragCounter <= 0) { dragCounter = 0; el.dropOverlay.classList.remove('visible'); }
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  el.dropOverlay.classList.remove('visible');
  if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files);
});

/* ================================================================== */
/*  HELPER KECIL                                                       */
/* ================================================================== */

function showInputError(inputEl, errorEl, msg) {
  inputEl.classList.add('error');
  errorEl.textContent = msg;
  errorEl.hidden = false;
  inputEl.focus();
}

function setLoading(btnEl, loading, originalText) {
  btnEl.disabled = loading;
  btnEl.textContent = loading ? '…' : originalText;
}

/* ================================================================== */
/*  EVENT LISTENERS                                                    */
/* ================================================================== */

// Upload
el.btnUpload.addEventListener('click', () => el.fileInput.click());
el.fabUpload.addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleFileUpload(e.target.files);
  e.target.value = '';
});

// Buat folder
el.btnNewFolder.addEventListener('click', openNewFolderModal);
el.btnConfirmFolder.addEventListener('click', confirmCreateFolder);
el.btnCancelFolder.addEventListener('click', closeNewFolderModal);
el.folderNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmCreateFolder();
  if (e.key === 'Escape') closeNewFolderModal();
});

// Rename
el.btnConfirmRename.addEventListener('click', confirmRename);
el.btnCancelRename.addEventListener('click', closeRenameModal);
el.renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmRename();
  if (e.key === 'Escape') closeRenameModal();
});

// Detail folder
el.btnCloseDetail.addEventListener('click', closeFolderDetail);
el.modalFolderDetail.addEventListener('click', (e) => { if (e.target === el.modalFolderDetail) closeFolderDetail(); });

// Pindahkan folder
el.btnConfirmMove.addEventListener('click', confirmMove);
el.btnCancelMove.addEventListener('click', closeMoveModal);
el.moveDestInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmMove();
  if (e.key === 'Escape') closeMoveModal();
});

// Hapus
el.btnConfirmDelete.addEventListener('click', confirmDelete);
el.btnCancelDelete.addEventListener('click', closeDeleteModal);

// Preview
el.btnClosePreview.addEventListener('click', closePreview);
el.modalPreview.addEventListener('click', (e) => { if (e.target === el.modalPreview) closePreview(); });

// Tutup semua modal dengan backdrop klik
el.modalNewFolder.addEventListener('click', (e) => { if (e.target === el.modalNewFolder) closeNewFolderModal(); });
el.modalRename.addEventListener('click', (e) => { if (e.target === el.modalRename) closeRenameModal(); });
el.modalMove.addEventListener('click', (e) => { if (e.target === el.modalMove) closeMoveModal(); });
el.modalDelete.addEventListener('click', (e) => { if (e.target === el.modalDelete) closeDeleteModal(); });

// Tutup semua modal dengan Escape
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeCtxMenu();
  if (!el.modalNewFolder.hidden) closeNewFolderModal();
  if (!el.modalRename.hidden) closeRenameModal();
  if (!el.modalFolderDetail.hidden) closeFolderDetail();
  if (!el.modalMove.hidden) closeMoveModal();
  if (!el.modalDelete.hidden) closeDeleteModal();
  if (!el.modalPreview.hidden) closePreview();
});

// Refresh & retry
el.btnRefresh.addEventListener('click', () => loadFiles());
el.btnRetry.addEventListener('click', () => loadFiles());

// Logout
if (el.btnLogout) {
  el.btnLogout.addEventListener('click', async () => {
    el.btnLogout.disabled = true;
    try {
      await apiLogout(); // blacklist token & hapus cookie sesi di backend
    } catch (_) {
      // Meski gagal (mis. sesi sudah kedaluwarsa / offline), tetap lanjut logout di sisi klien.
    }
    localStorage.removeItem('rumahdrive_user');
    window.location.href = '/storage/login';
  });
}

// Tutup progress
el.btnCancelAll.addEventListener('click', () => {
  el.uploadProgressArea.hidden = true;
  el.uploadProgressList.innerHTML = '';
});

// Toggle view
el.btnViewToggle.addEventListener('click', toggleViewMode);

/* ================================================================== */
/*  INIT                                                               */
/* ================================================================== */

(async function init() {
  // FIX: restore path terakhir dari localStorage, fallback ke '/'
  let savedPath = '/';
  try { savedPath = localStorage.getItem('rd_path') || '/'; } catch (_) { }

  state.currentPath = savedPath;
  updateBreadcrumb(savedPath);
  await loadFiles(savedPath);
  loadStorageInfo();
})();