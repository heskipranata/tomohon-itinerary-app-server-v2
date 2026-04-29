# API Documentation for Frontend

Dokumen ini merangkum endpoint backend yang aktif untuk kebutuhan frontend.

## 1. Base URL

- Local: `http://localhost:4000`
- Prefix API: `/api`
- Contoh full URL endpoint: `http://localhost:4000/api/objek-wisata/rekomendasi-itinerary`

## 2. Format Response Umum

### Success

```json
{
  "message": "...",
  "total": 0,
  "data": {}
}
```

Catatan:

- `total` tidak selalu ada di semua endpoint.
- Beberapa endpoint mengembalikan `data` berupa array, object, atau string list.

### Error

```json
{
  "message": "...",
  "error": "..."
}
```

## 3. Auth dan Session

- Login admin memakai cookie `token` (httpOnly).
- Untuk request dari frontend browser, gunakan `credentials: "include"`.
- Endpoint admin dilindungi middleware auth (401/403 jika tidak valid).
- Selain cookie, backend juga mendukung header `Authorization: Bearer <token>`.

## 4. Public Endpoints (Frontend User)

## 4.1 POST /api/objek-wisata/rekomendasi-itinerary

Membuat itinerary wisata berdasarkan preferensi user.

### Body (field utama)

```json
{
  "latitude": 1.234,
  "longitude": 124.567,
  "jumlahHariWisata": 2,
  "jamMulai": "08:00",
  "jamBerakhir": "18:00",
  "jenisWisata": ["alam", "budaya"],
  "jumlahTempatWisata": 5,
  "butuhMakanSiang": true,
  "butuhAkomodasi": true,
  "averageSpeedKmh": 30,
  "visitDurationMode": "kategori"
}
```

### Alias field yang didukung backend

- Koordinat:
  - `koordinat.latitude` / `koordinat.longitude`
  - `coordinate.latitude` / `coordinate.longitude`
  - atau langsung `userLatitude`/`userLongitude`, `latitude`/`longitude`, `lat`/`lng`
- Hari:
  - `jumlahHariWisata` atau `travelDays`
- Jam mulai:
  - `jamMulai`, `startHour`, `startTime`, `waktuMulai`, `jamAwal`
- Jam selesai:
  - `jamBerakhir`, `endHour`, `endTime`, `waktuBerakhir`, `jamSelesai`, `jamAkhir`
- Preferensi kategori:
  - `jenisWisata` atau `preferences`
- Batas jumlah tempat wisata:
  - `jumlahTempatWisata` atau `maxDestinations`
- Lunch stop:
  - `butuhMakanSiang`, `needLunchStop`, `includeLunchStop`
- Akomodasi:
  - `butuhAkomodasi`, `needAccommodation`, `includeAccommodation`

### Catatan bisnis penting

- `jumlahTempatWisata` dihitung untuk tempat wisata (tourism) saja.
- Lunch stop dan accommodation stop berada di luar kuota wisata.
- Durasi lunch default: 90 menit.
- Window lunch default: 11:30-14:30.
- Window accommodation default: 17:00-22:00.

### Response ringkas

- `data.itineraryByDay`: itinerary detail per hari
- `data.simpleItinerary`: versi ringkas untuk ditampilkan cepat
- `data.recommendedDestinations`: daftar stop terpilih
- `data.summary`: statistik itinerary

## 4.2 GET /api/objek-wisata/kategori-tersedia

Mengambil daftar kategori wisata yang tersedia.

### Response contoh

```json
{
  "message": "Daftar kategori objek wisata berhasil diambil",
  "total": 6,
  "data": ["alam", "kuliner", "budaya"]
}
```

## 4.3 POST /api/objek-wisata/rekomendasi-itinerary/replacement-preview

Membuat daftar alternatif pengganti untuk 1 stop pada draft itinerary.

### Body

```json
{
  "draftItinerary": {
    "itineraryByDay": []
  },
  "stopId": 10,
  "sameCategoryOnly": true,
  "limit": 5,
  "averageSpeedKmh": 30
}
```

### Alias yang didukung

- Draft:
  - `draftItinerary` atau `itinerary` atau `data`
- Stop target:
  - `stopId` atau `destinationId`

### Response ringkas

- `data.targetStop`: stop yang akan diganti
- `data.anchors`: titik sebelum/sesudah untuk evaluasi rute
- `data.alternatives`: alternatif kandidat pengganti

## 4.4 POST /api/objek-wisata/rekomendasi-itinerary/replacement-confirm

Menerapkan penggantian 1 stop pada draft itinerary.

### Body

```json
{
  "draftItinerary": {
    "itineraryByDay": []
  },
  "stopId": 10,
  "replacementDestinationId": 22,
  "averageSpeedKmh": 30
}
```

### Alias yang didukung

- Stop target:
  - `stopId` atau `destinationId`
- ID pengganti:
  - `replacementDestinationId` atau `newDestinationId`

### Response ringkas

- `data.updatedDraft`: draft itinerary setelah penggantian
- `data.targetStop`: stop lama
- `data.replacementStop`: stop baru

## 5. Admin Auth Endpoints

## 5.1 POST /api/admin/login

Login admin, set cookie token.

### Body

```json
{
  "email": "admin@example.com",
  "password": "secret"
}
```

### Success

```json
{
  "message": "Login successfully",
  "admin": {
    "id": 1,
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

## 5.2 POST /api/admin/logout

Logout admin, clear cookie token.

## 6. Admin Kategori Endpoints (Protected)

Semua endpoint di bawah butuh token admin valid.

## 6.1 GET /api/admin/kategori

Ambil daftar kategori.

## 6.2 POST /api/admin/kategori

Tambah kategori baru.

### Body

```json
{
  "nama": "alam"
}
```

atau

```json
{
  "nama_kategori": "alam"
}
```

## 6.3 DELETE /api/admin/kategori/:id

Hapus kategori berdasarkan ID.

## 7. Admin Wisata Endpoints (Protected)

Semua endpoint di bawah butuh token admin valid.

## 7.1 GET /api/admin/wisata

Ambil daftar objek wisata.

## 7.2 GET /api/admin/wisata/:id

Ambil detail objek wisata berdasarkan ID.

## 7.3 POST /api/admin/wisata

Tambah objek wisata.

### Minimal body required

```json
{
  "nama_objek_wisata": "Bukit X",
  "lokasi": "Tomohon"
}
```

Field lain boleh dikirim sesuai kolom tabel `objek_wisata`.

## 7.4 PATCH /api/admin/wisata/:id

Update objek wisata by ID.

### Body

- Minimal kirim 1 field.
- Field bebas mengikuti kolom tabel `objek_wisata`.

## 7.5 DELETE /api/admin/wisata/:id

Hapus objek wisata by ID.

## 8. Debug Endpoints (Opsional untuk FE, mostly internal)

- POST `/api/objek-wisata/debug/terdekat`
- POST `/api/objek-wisata/debug/terdekat-only`
- POST `/api/objek-wisata/debug/terdekat-only/kategori`

Disarankan dipakai untuk development/debug, bukan untuk flow UI utama production.

## 9. Contoh Fetch Frontend (dengan cookie)

```ts
const response = await fetch("http://localhost:4000/api/admin/kategori", {
  method: "GET",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
  },
});

const result = await response.json();
```

## 10. Status Code Ringkas

- `200` sukses read/update/delete
- `201` sukses create
- `400` input tidak valid
- `401` unauthorized (token tidak ada/tidak valid)
- `403` forbidden (bukan admin)
- `404` data tidak ditemukan
- `409` conflict (mis. kategori masih dipakai)
- `500` internal server error
