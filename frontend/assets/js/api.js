/**
 * api.js — RumahDrive
 * Semua fungsi fetch ke FastAPI backend.
 * Dimuat sebelum app.js via tag <script> di index.html.
 */

// const API_BASE = 'http://192.168.1.4:2026/thorix'; // Ganti jika FastAPI berjalan di port berbeda, misal 'http://192.168.1.10:8000/api'
// 1. Ambil base URL (origin) dari halaman saat ini
const baseUrl = window.location.origin; // Hasil: "http://192.168.1.4:8000"

// 2. Gabungkan dengan "/api"
const API_BASE = `${baseUrl}/storage/thorix-api`;

/* ================================================================== */
/*  HELPER — bungkus fetch + error handling seragam                    */
/*  Sesi login disimpan lewat cookie HttpOnly yang di-set backend      */
/*  (lihat /auth/login) — browser otomatis mengirimnya asal            */
/*  "credentials: 'include'" diset, jadi TIDAK ADA token yang perlu    */
/*  disimpan/dikirim manual dari sisi frontend.                        */
/* ================================================================== */
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { ...options, credentials: 'include' });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const b = await res.json(); msg = typeof b.detail === 'object' ? JSON.stringify(b.detail) : (b.detail || b.message || msg); } catch (_) {}
    throw new Error(msg);
  }
  if (res.status === 204) return null; // No Content
  return res.json();
}

/* ================================================================== */
/*  1. LIST FILE & FOLDER                                              */
/*  GET /api/files?path=/                                              */
/* ================================================================== */
/**
 * @param {string} folderPath  misal "/" atau "/Foto/Liburan"
 * @returns {Promise<ListResponse>}
 */
async function apiListFiles(folderPath = '/') {
  return apiFetch(`/files?path=${encodeURIComponent(folderPath)}`);
}

/*
  Response 200:
  {
    "current_path"    : "/Foto",
    "total_size_bytes": 107374182400,
    "used_size_bytes" : 23622320128,
    "items": [
      {
        "id"           : "L0ZvdG8vTGlidXJhbiBCYWxp",
        "name"         : "Liburan Bali",
        "type"         : "folder",
        "path"         : "/Foto/Liburan Bali",
        "size_bytes"   : 0,
        "item_count"   : 12,
        "created_at"   : "2025-06-01T10:00:00Z",
        "modified_at"  : "2025-06-15T08:30:00Z",
        "mime_type"    : null,
        "thumbnail_url": null
      },
      {
        "id"           : "L0ZvdG8vcGFudGFpLmpwZw==",
        "name"         : "pantai.jpg",
        "type"         : "file",
        "path"         : "/Foto/pantai.jpg",
        "size_bytes"   : 2457600,
        "item_count"   : 0,
        "created_at"   : "2025-06-15T09:12:00Z",
        "modified_at"  : "2025-06-15T09:12:00Z",
        "mime_type"    : "image/jpeg",
        "thumbnail_url": "/api/files/L0ZvdG8vcGFudGFpLmpwZw==/thumbnail"
      }
    ]
  }
*/

/* ================================================================== */
/*  2. UPLOAD FILE                                                     */
/*  POST /api/files/upload                                             */
/* ================================================================== */
/**
 * Upload satu file — pakai XHR agar bisa lacak progress.
 * @param {File}     file
 * @param {string}   folderPath   folder tujuan
 * @param {Function} onProgress   callback(percent: number)
 * @returns {Promise<FileItem>}
 */
function apiUploadFile(file, folderPath, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr  = new XMLHttpRequest();
    const form = new FormData();
    
    // 1. FIX: Ubah key dari 'file' menjadi 'upload_file' agar sesuai dengan backend Python
    form.append('upload_file', file); 

    // 2. FIX: Pindahkan 'path' dan 'password' ke URL Query String (?path=...&password=...)
    // Catatan: "password" di sini adalah kunci root filesystem (env KEY di backend),
    // BUKAN kata sandi akun login. Dua hal berbeda — lihat apiLogin() di bawah untuk auth akun.
    const rootKey = localStorage.getItem('rumahdrive_root_key') || "N@dh1fTh0121q1";
    const q = new URLSearchParams({ path: folderPath, password: rootKey });
    xhr.open('POST', `${API_BASE}/files/upload?${q}`);
    xhr.withCredentials = true; // ikut sertakan cookie sesi login (HttpOnly)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch (_) { resolve(null); }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try { 
          const b = JSON.parse(xhr.responseText); 
          // 3. FIX: Agar eror tidak memunculkan [object Object] lagi di console
          msg = typeof b.detail === 'object' ? JSON.stringify(b.detail) : (b.detail || msg); 
        } catch (_) {}
        reject(new Error(msg));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Upload gagal (network error)')));
    xhr.send(form);
  });
}

/*
  Response 201:
  {
    "id"           : "L1ZpZGVvL3ZpZGVvLm1wNA==",
    "name"         : "video.mp4",
    "type"         : "file",
    "path"         : "/Video/video.mp4",
    "size_bytes"   : 52428800,
    "item_count"   : 0,
    "created_at"   : "2025-07-01T14:22:00Z",
    "modified_at"  : "2025-07-01T14:22:00Z",
    "mime_type"    : "video/mp4",
    "thumbnail_url": null
  }
*/

/* ================================================================== */
/*  3. HAPUS FILE                                                      */
/*  DELETE /api/files/{id}                                             */
/* ================================================================== */
/**
 * @param {string} itemId
 * @returns {Promise<null>}  204 No Content
 */
async function apiDeleteItem(itemId) {
  return apiFetch(`/files/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}

/* ================================================================== */
/*  4. RENAME FILE                                                     */
/*  PUT /api/files/{id}                                                */
/* ================================================================== */
/**
 * @param {string} itemId
 * @param {string} newName   nama file baru saja, bukan path penuh
 * @returns {Promise<FileItem>}
 */
async function apiRenameFile(itemId, newName) {
  return apiFetch(`/files/${encodeURIComponent(itemId)}`, {
    method : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify(newName),   // string JSON: "NamaBaruFile.jpg"
  });
}

/*
  Body DIKIRIM:  "NamaFileBaru.jpg"

  Response 200:
  {
    "id"  : "L0ZvdG8vbmFtYV9iYXJ1LmpwZw==",
    "name": "nama_baru.jpg",
    "path": "/Foto/nama_baru.jpg",
    ...
  }
*/

/* ================================================================== */
/*  5. DOWNLOAD FILE                                                   */
/*  GET /api/files/{id}/download                                       */
/* ================================================================== */
/**
 * Kembalikan URL download — gunakan langsung di <a href> atau window.location.
 * Tidak perlu fetch async.
 * @param {string} itemId
 * @returns {string}
 */
function apiDownloadUrl(itemId, isPreview = false) {
  return `${API_BASE}/files/${encodeURIComponent(itemId)}/download?preview=${isPreview}`;
}

/* ================================================================== */
/*  6. BUAT FOLDER                                                     */
/*  POST /api/folders                                                  */
/* ================================================================== */
/**
 * @param {string} folderName
 * @param {string} parentPath   misal "/"
 * @returns {Promise<FolderItem>}
 */
async function apiCreateFolder(folderName, parentPath = '/') {
  return apiFetch('/folders', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json', "accept": "application/json" },
    body   : JSON.stringify({ name: folderName, parent_path: parentPath }),
  });
}

/*
  Body DIKIRIM:   { "name": "Dokumen Sekolah", "parent_path": "/Anak" }

  Response 201:
  {
    "id"          : "L0FuYWsvRG9rdW1lbiBTZWtvbGFo",
    "name"        : "Dokumen Sekolah",
    "type"        : "folder",
    "path"        : "/Anak/Dokumen Sekolah",
    "size_bytes"  : 0,
    "item_count"  : 0,
    "created_at"  : "2025-07-01T15:00:00Z",
    "modified_at" : "2025-07-01T15:00:00Z",
    "mime_type"   : null,
    "thumbnail_url": null
  }
*/

/* ================================================================== */
/*  7. DETAIL FOLDER                                                   */
/*  GET /api/folders/{id}                                              */
/* ================================================================== */
/**
 * Metadata folder itu sendiri — bukan isinya.
 * @param {string} folderId
 * @returns {Promise<FolderDetail>}
 */
async function apiGetFolder(folderId) {
  return apiFetch(`/folders/${encodeURIComponent(folderId)}`);
}

/*
  Response 200:
  {
    "id"          : "L0ZvdG8vTGlidXJhbiBCYWxp",
    "name"        : "Liburan Bali",
    "type"        : "folder",
    "path"        : "/Foto/Liburan Bali",
    "parent_path" : "/Foto",
    "size_bytes"  : 10485760,
    "item_count"  : 7,
    "created_at"  : "2025-06-01T10:00:00Z",
    "modified_at" : "2025-06-15T08:30:00Z",
    "mime_type"   : null,
    "thumbnail_url": null
  }
*/

/* ================================================================== */
/*  8. RENAME FOLDER                                                   */
/*  PATCH /api/folders/{id}                                            */
/* ================================================================== */
/**
 * @param {string} folderId
 * @param {string} newName
 * @returns {Promise<FolderItem>}
 */
async function apiRenameFolder(folderId, newName) {
  return apiFetch(`/folders/${encodeURIComponent(folderId)}`, {
    method : 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ name: newName }),
  });
}

/*
  Body DIKIRIM:   { "name": "Liburan Bali 2025" }

  Response 200:  FolderItem dengan name & path baru.
  ⚠️ id ikut berubah karena id = base64(path) dan path berubah.
  app.js akan reload daftar file otomatis setelah rename.
*/

/* ================================================================== */
/*  9. PINDAHKAN FOLDER                                                */
/*  PATCH /api/folders/{id}/move                                       */
/* ================================================================== */
/**
 * @param {string} folderId
 * @param {string} newParentPath   path folder tujuan, misal "/Arsip"
 * @returns {Promise<FolderItem>}
 */
async function apimoveFolder(folderId, newParentPath) {
  return apiFetch(`/folders/${encodeURIComponent(folderId)}/move`, {
    method : 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify( newParentPath ),
  });
}

/*
  Body DIKIRIM:   { "new_parent_path": "/Arsip" }

  Response 200:  FolderItem dengan path & id baru.
*/

/* ================================================================== */
/*  10. HAPUS FOLDER                                                   */
/*  DELETE /api/folders/{id}                                           */
/* ================================================================== */
/**
 * Hapus folder + seluruh isinya (rekursif).
 * @param {string} folderId
 * @returns {Promise<null>}  204 No Content
 */
async function apiDeleteFolder(folderId) {
  return apiFetch(`/folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' });
}

/*
  Response 204:  body kosong.
  Response 404:  { "detail": "Folder tidak ditemukan." }
  ⚠️  DESTRUKTIF — shutil.rmtree() di backend, tidak bisa di-undo.
*/

/* ================================================================== */
/*  11. INFO STORAGE                                                   */
/*  GET /api/storage/info                                              */
/* ================================================================== */
/**
 * @returns {Promise<StorageInfo>}
 */
async function apiGetStorageInfo() {
  return apiFetch('/storage/info');
}

/*
  Response 200:
  {
    "total_bytes": 107374182400,
    "used_bytes" : 23622320128,
    "free_bytes" : 83751862272
  }
*/

/* ================================================================== */
/*  12. AUTH — LOGIN, LOGOUT, PROFIL                                   */
/*  POST /api/auth/login · POST /api/auth/logout · GET /api/auth/me    */
/*  (dipakai oleh login.js & auth-guard.js)                            */
/* ================================================================== */
/**
 * @param {string}  email
 * @param {string}  password
 * @param {boolean} remember   jika true, sesi bertahan lebih lama
 * @returns {Promise<{access_token:string, token_type:string, expires_at:string, user:{id:string,nama:string,email:string}}>}
 */
async function apiLogin(email, password, remember = false) {
  return apiFetch('/auth/login', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ email, password, remember }),
  });
}

/**
 * Mendaftarkan akun keluarga baru.
 * Dipakai untuk setup akun pertama (bootstrap, tanpa perlu login)
 * atau menambah anggota keluarga lain (perlu sudah login).
 * @param {string} nama
 * @param {string} email
 * @param {string} password
 */
async function apiRegister(nama, email, password) {
  return apiFetch('/auth/register', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ nama, email, password }),
  });
}

/**
 * Mengambil profil singkat pemilik token yang sedang dipakai.
 * Dipakai auth-guard.js untuk memvalidasi sesi sebelum menampilkan halaman.
 * @returns {Promise<{id:string, nama:string, email:string}>}
 */
async function apiMe() {
  return apiFetch('/auth/me');
}

/**
 * Mem-blacklist token yang sedang dipakai di backend (204 No Content).
 */
async function apiLogout() {
  return apiFetch('/auth/logout', { method: 'POST' });
}
