# RumahDrive

RumahDrive adalah aplikasi penyimpanan file pribadi/keluarga berbasis web, mirip Google Drive versi rumahan. Backend dibangun dengan **FastAPI** dan frontend berupa halaman statis (HTML/CSS/JavaScript) yang dilayani langsung oleh FastAPI.

Fitur utama:

- Login akun keluarga (email + password) dengan sesi berbasis cookie HttpOnly (JWT)
- Upload file (banyak file sekaligus, drag & drop, ada progress upload)
- Buat, ganti nama, pindahkan, dan hapus folder
- Ganti nama, hapus, unduh, dan pratinjau file (gambar/thumbnail, PDF)
- Tampilan grid/daftar dan breadcrumb navigasi folder
- Info penggunaan disk (total, terpakai, sisa)
- Reboot / shutdown server dari API (dengan mode *lockdown* sementara)

---

## 1. Teknologi

| Bagian | Teknologi |
|---|---|
| Bahasa | Python 3.12 |
| Web framework | FastAPI + Uvicorn |
| Template | Jinja2 |
| Database | SQLModel + SQLAlchemy async (MariaDB/MySQL via `aiomysql`, atau PostgreSQL via `asyncpg`) |
| Autentikasi | bcrypt (hash password) + PyJWT (token) |
| Konfigurasi | pydantic-settings + python-dotenv |
| Frontend | HTML, CSS, JavaScript murni (tanpa framework) |

Database hanya dipakai untuk akun login dan daftar token yang sudah logout. File dan folder disimpan langsung di disk (filesystem).

---

## 2. Cara Kerja

1. `main.py` membuat aplikasi FastAPI dengan `root_path="/storage"`, mengaktifkan CORS, dan memasang folder statis `frontend/assets` di `/thorix-assets`.
2. Saat startup, aplikasi membuat tabel database otomatis (`auth`, `blacklist_token`). Jika `ADMIN_EMAIL` dan `ADMIN_PASSWORD` diisi di `.env` dan tabel akun masih kosong, akun pertama dibuat otomatis.
3. Pengguna membuka halaman login (`/login`), lalu masuk lewat `POST /thorix-api/auth/login`. Token JWT disimpan di cookie HttpOnly bernama `rumahdrive_token`, sehingga JavaScript tidak perlu menyimpan token apa pun.
4. Frontend memanggil API di `/storage/thorix-api/...` dengan `credentials: 'include'`.
5. Setiap file/folder diidentifikasi dengan **ID = path virtual yang di-encode base64 URL-safe**. Contoh: `/Foto/pantai.jpg` menjadi `L0ZvdG8vcGFudGFpLmpwZw==`.
6. Path virtual dipetakan ke path asli di dalam direktori `DIR`, dengan perlindungan *path traversal* (`../`) agar tidak keluar dari direktori root.
7. Saat reboot/shutdown dipicu, server masuk mode *lockdown* selama 5 detik: semua request `POST`, `PUT`, `PATCH`, dan `DELETE` ditolak dengan status 503.

---

## 3. Struktur Proyek

```
RumahDrive/
├── main.py                      # Entry point aplikasi FastAPI
├── requirements.txt             # Daftar dependensi Python
├── .env.example                 # Contoh konfigurasi environment
│
├── backend/
│   ├── __init__.py              # Menggabungkan semua router (prefix /thorix-api)
│   └── apps/
│       ├── api/                 # Router (endpoint HTTP)
│       │   ├── auth.py          # /auth/register, /login, /logout, /me
│       │   ├── files.py         # /files/...
│       │   ├── folders.py       # /folders/...
│       │   ├── storage.py       # /storage/info
│       │   └── pysystem.py      # /system/{aksi}
│       ├── core/
│       │   └── security.py      # Hash password, JWT, cookie, dependency user login
│       ├── db/
│       │   ├── config.py        # Settings (.env), tipe GUID, helper simpan/tampil data
│       │   └── session.py       # Engine & session database async
│       ├── models/
│       │   └── auth_model.py    # Tabel Auth dan BlacklistToken
│       ├── schemas/
│       │   └── auth.py          # Validasi request (termasuk kekuatan password)
│       └── service/             # Logika bisnis
│           ├── auth.py
│           ├── files.py
│           ├── folders.py
│           ├── storage.py
│           └── services_pysystem.py
│
└── frontend/
    ├── __init__.py              # Router halaman: / dan /login
    ├── API_CONTRACT.md          # Dokumentasi kontrak API untuk frontend
    ├── html/
    │   ├── index.html           # Halaman utama (file manager)
    │   └── login.html           # Halaman login
    └── assets/
        ├── css/                 # style.css, login.css
        └── js/                  # api.js, app.js, auth-guard.js, login.js
```

---

## 4. Instalasi

### 4.1 Prasyarat

- Python 3.12
- Server **MariaDB/MySQL** atau **PostgreSQL** yang sudah berjalan, dengan database kosong (contoh: `rumahdrive`)

### 4.2 Siapkan virtual environment

```bash
python -m venv venv

# Linux / macOS
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### 4.3 Install dependensi

```bash
pip install -r requirements.txt
```

`requirements.txt` memuat `aiomysql` (MariaDB/MySQL) dan `asyncpg` (PostgreSQL). Cukup pasang driver yang kamu pakai.

Catatan untuk laptop **32-bit**: di bagian bawah `requirements.txt` ada daftar versi paket (dikomentari) yang dipakai pada mesin 32-bit dan 64-bit. Driver `asyncpg` dan `asyncmy` umumnya tidak punya paket jadi untuk 32-bit, jadi bisa gagal dipasang kecuali kamu compile sendiri.

### 4.4 Buat file `.env`

```bash
cp .env.example .env
```

Lalu isi sesuai kebutuhan:

```env
DATABASE_URL=mysql+aiomysql://user:password@localhost:3306/rumahdrive
SECRET_KEY=isi-dengan-string-acak-yang-panjang
DIR=/mnt/storage
PORT=8000
DEBUG=false
KEY=
ADMIN_NAMA=Keluarga
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | URL koneksi database async. MariaDB/MySQL: `mysql+aiomysql://...`. PostgreSQL: `postgresql+asyncpg://...` |
| `SECRET_KEY` | Kunci rahasia untuk menandatangani JWT. Wajib diisi. Contoh membuat: `python -c "import secrets;print(secrets.token_hex(32))"` |
| `DIR` | Folder root tempat semua file disimpan. Dibuat otomatis jika belum ada. Default: `./storage` |
| `PORT` | Port server. Default: `8000` |
| `DEBUG` | `true` untuk mengaktifkan auto-reload saat development |
| `KEY` | Kunci root filesystem. Berisi password root yang di-encode base64 URL-safe (lihat bagian 7) |
| `ADMIN_NAMA`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Opsional. Akun pertama yang dibuat otomatis saat server pertama kali menyala |

Variabel opsional lain (punya nilai default): `ACCESS_TOKEN_EXPIRE_MINUTES` (default 1440 menit / 1 hari), `REMEMBER_TOKEN_EXPIRE_DAYS` (default 30 hari), dan `COOKIE_SECURE` (isi `true` jika server sudah memakai HTTPS).

---

## 5. Menjalankan Program

```bash
python main.py
```

Server berjalan di `http://0.0.0.0:<PORT>` (default port 8000).

Karena aplikasi memakai `root_path="/storage"`, alamat yang dipakai browser adalah lewat prefix `/storage`, biasanya melalui reverse proxy Nginx:

```nginx
location /storage/ {
    proxy_pass http://127.0.0.1:8000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 0;   # izinkan upload file besar
}
```

Setelah berjalan:

| Halaman | Alamat |
|---|---|
| Aplikasi (file manager) | `/storage/` |
| Halaman login | `/storage/login` |
| Swagger UI | `/storage/docs` |
| ReDoc | `/storage/redoc` |
| Cek status server | `/storage/status` |

Jika ingin mencoba tanpa Nginx, hapus atau ubah `root_path` di `main.py`, dan sesuaikan `API_BASE` di `frontend/assets/js/api.js`.

### Login pertama kali

- Jika `ADMIN_EMAIL` dan `ADMIN_PASSWORD` sudah diisi di `.env`, login langsung dengan akun itu.
- Jika dikosongkan, daftarkan akun pertama lewat `POST /thorix-api/auth/register`. Endpoint ini hanya bisa dipanggil tanpa login selama tabel akun masih kosong. Setelah itu, pendaftaran akun baru harus dilakukan oleh anggota yang sudah login.

Aturan password: minimal 8 karakter, mengandung huruf besar, huruf kecil, angka, dan simbol khusus.

---

## 6. Endpoint API

Semua endpoint berada di bawah prefix `/thorix-api`.

### Autentikasi (`/auth`)

| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/auth/register` | Daftarkan akun baru |
| `POST` | `/auth/login` | Login, mengatur cookie sesi |
| `POST` | `/auth/logout` | Logout, token dimasukkan ke blacklist |
| `GET` | `/auth/me` | Data akun yang sedang login |

### Folder (`/folders`)

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/folders/{folder_id}` | Detail folder |
| `POST` | `/folders/` | Buat folder baru |
| `PATCH` | `/folders/{folder_id}` | Ganti nama folder |
| `PATCH` | `/folders/{folder_id}/move` | Pindahkan folder |
| `DELETE` | `/folders/{folder_id}` | Hapus folder |

### File (`/files`)

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/files?path=.` | Tampilkan isi folder |
| `POST` | `/files/upload?path=.` | Upload file |
| `PUT` | `/files/{file_id}` | Ganti nama file |
| `DELETE` | `/files/{file_id}` | Hapus file |
| `GET` | `/files/{id}/download?preview=false` | Unduh atau pratinjau file |
| `GET` | `/files/{id}/thumbnail` | Thumbnail gambar |

### Penyimpanan dan sistem

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/storage/info` | Total, terpakai, dan sisa disk (dalam byte) |
| `POST` | `/system/{aksi}?root_pass=...` | `aksi` = `reboot` atau `shutdown`. Wajib login |

Detail request dan respons ada di `frontend/API_CONTRACT.md` serta di Swagger UI (`/docs`).

---

## 7. Parameter `password` dan `KEY`

Endpoint file dan folder menerima query parameter `password`. Nilainya dibandingkan, dalam bentuk base64 URL-safe, dengan variabel `KEY` di `.env`. Jika cocok, operasi berjalan dalam **mode root**: pemeriksaan path traversal dilewati sehingga bisa mengakses path di luar direktori `DIR`.

Cara membuat nilai `KEY`:

```python
import base64
print(base64.urlsafe_b64encode("password-root-kamu".encode()).decode())
```

Salin hasilnya ke `KEY=` di `.env`.

Endpoint `/system/{aksi}` menjalankan `sudo reboot` atau `sudo shutdown -h now`, dengan password yang dikirim lewat `root_pass`. Fitur ini hanya relevan di server Linux yang akun-nya punya akses `sudo`.

---

## 8. Catatan Keamanan

- Set `SECRET_KEY` dengan string acak yang panjang, dan jangan pernah mengunggah file `.env` ke repository.
- Set `COOKIE_SECURE=true` jika server diakses lewat HTTPS.
- Endpoint `/files` dan `/folders` saat ini tidak mewajibkan login (hanya `/auth/me`, `/auth/register` setelah akun pertama, dan `/system` yang memeriksa sesi). Jika server dibuka ke jaringan luas atau internet, tambahkan dependency `get_current_user` pada router tersebut.
- CORS saat ini diizinkan untuk semua origin (`*`). Batasi ke domain yang dipakai untuk production.
- `echo=True` pada engine database mencetak semua query ke log. Matikan untuk production.
- Password pada parameter `root_pass` dan `password` dikirim lewat URL query, yang bisa tercatat di log server. Gunakan HTTPS dan hindari membagikan URL tersebut.

---

## 9. Lisensi

Tentukan lisensi sesuai kebutuhan proyek (misalnya MIT).