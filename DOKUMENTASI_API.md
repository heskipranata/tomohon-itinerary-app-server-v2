# Dokumentasi API Itinerary App PWA

## 📋 Daftar Isi

1. [Data Storage Strategy (Approach 3)](#data-storage-strategy-approach-3)
2. [Simpan Rencana Perjalanan](#simpan-rencana-perjalanan)
3. [Update Progress Kunjungan](#update-progress-kunjungan)
4. [Admin Endpoints](#admin-endpoints)
5. [Troubleshooting](#troubleshooting)

---

## Update Minat User

### Endpoint

```
PATCH /api/auth/profile
```

### Deskripsi

Mengubah daftar minat kategori milik user yang sedang login.

### Authentication

- Wajib login
- Kirim token via `Authorization: Bearer <token>` atau cookie `token`

### Request Body

```json
{
  "minatKategori": ["taman", "bukit", "pantai"]
}
```

`minatKategori` boleh berupa array atau string dipisah koma.

### Response Sukses

```json
{
  "message": "Minat kategori berhasil diperbarui",
  "user": {
    "id": "uuid-user",
    "nama": "Budi",
    "email": "budi@mail.com",
    "role": "user",
    "minatKategori": ["taman", "bukit", "pantai"],
    "createdAt": "2026-05-06T10:30:00Z",
    "updatedAt": "2026-05-06T10:40:00Z"
  }
}
```

### Catatan

Setelah minat diubah, data wisata yang sesuai bisa diambil lewat:

```
GET /api/objek-wisata/rekomendasi-minat
```

## Data Storage Strategy (Approach 3)

### 🎯 Konsep Utama

Backend menggunakan **Approach 3 - Minimal Data Structure** untuk menyimpan itinerary dengan efisiensi maksimal:

- **Penyimpanan**: Hanya menyimpan struktur minimal (visitList + summary) = ~1KB per trip
- **Detail On-Demand**: Data detail (nama, harga, deskripsi) diambil dari tabel `objek_wisata` saat dibutuhkan
- **Rute On-Demand**: Rute perjalanan dihitung dari koordinat `objek_wisata` menggunakan OSRM
- **Keuntungan**:
  - ✅ Database lebih ringan (50-100KB → 1KB)
  - ✅ Query lebih cepat
  - ✅ Scalable untuk jutaan trips
  - ✅ Data tidak duplikasi (single source of truth di `objek_wisata`)

### 🔄 Alur Data

```
Frontend                Backend (API)              Database
   │                        │                         │
   ├─ Generate ────────────► Generate Service ────► Query objek_wisata
   │                        │ (itinerary planner)   Query routing (OSRM)
   │                        │ Return full itinerary
   │◄─ Full itinerary ─────┤
   │   (for preview)        │
   │                        │
   ├─ Save ───────────────► Save Service ─────────► Extract visitList
   │  (full itinerary)      │ (extract minimal)    Store minimal (~1KB)
   │                        │ Detect visitType
   │◄─ Saved trip ID ──────┤
   │                        │
   ├─ Fetch saved trip ───► Retrieve Service ────► Get minimal visitList
   │                        │                       Return stored data
   │◄─ Minimal data ───────┤
   │                        │
   ├─ Display UI ──────────► (Frontend logic)
   │  (local enrichment)    - For each wisata:
   │                          Fetch detail from /api/objek-wisata/:id
   │                        - Combine with visitList
   │                        - Render UI
   │
```

### 📊 Struktur visitType

Setiap visit dalam `visitList` memiliki `visitType` yang otomatis dideteksi:

| visitType         | Deskripsi                   | Keyword Detection                                                               | wisataId         |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------- | ---------------- |
| **wisata**        | Destinasi wisata/attraction | Jika ada di `objek_wisata`                                                      | Number atau null |
| **food**          | Tempat makan/restaurant     | resto, restaurant, makan, kuliner, cafe, warung, bakery                         | null (custom)    |
| **accommodation** | Penginapan/hotel            | hotel, akomodasi, penginapan, villa, homestay, resort, lodge, inn, cottage, bed | null (custom)    |

**Contoh Deteksi:**

```
"Taman Nasional Bunaken" → wisata (ada di objek_wisata.id=1)
"Restoran Coto Manado" → food (keyword: "restoran")
"Hotel Manado Soft" → accommodation (keyword: "hotel")
```

---

## Simpan Rencana Perjalanan

### Endpoint

```
POST /api/rencana-perjalanan
```

### Deskripsi

Menyimpan itinerary yang sudah direkomendasikan ke database. **User biasa BISA menggunakan endpoint ini.** Memerlukan autentikasi (token JWT).

⚠️ **PENTING**: Endpoint ini **BUKAN** admin-only. User biasa (`role='user'`) sepenuhnya bisa mengakses endpoint ini untuk menyimpan perjalanan mereka sendiri.

### Authentication

- **Tipe**: Bearer Token (JWT)
- **Cara**: Kirim di header `Authorization: Bearer <token>` atau di cookie `token`
- **Durasi**: 24 jam

### Request Body

#### ✅ ALUR END-TO-END (Generate → Simpan) - FLEKSIBEL & KONSISTEN

Backend sudah design agar **tidak menyusahkan frontend**. Berikut alur lengkapnya:

**Step 1: Generate Itinerary**

```javascript
const genResp = await fetch('/api/objek-wisata/rekomendasi-itinerary', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ ... })
});

const { data: itinerary } = await genResp.json();
// itinerary sekarang punya struktur:
// {
//   itineraryByDay: [...],
//   recommendedDestinations: [...],
//   travelMetrics: { totalDays, totalDistance, ... }, ← SUDAH ADA!
//   simpleItinerary: [...],
//   route: {...},
//   summary: {...}
// }
```

**Step 2: Simpan ke Database**

```javascript
const saveResp = await fetch("/api/rencana-perjalanan", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    itinerary, // ← LANGSUNG PAKAI, TIDAK PERLU TRANSFORM!
    judul_trip: "Trip Manado 3 Hari",
    tanggal_mulai: "2026-05-06",
    durasi_hari: 3,
  }),
});
```

✨ **Fleksibel!** Backend accept itinerary yang di-generate langsung. Frontend tidak perlu manual construct `travelMetrics` atau transform format. Semua sudah konsisten.

#### Field yang Required:

⚠️ **Struktur `itinerary` HARUS memiliki field: `itineraryByDay`, `recommendedDestinations`, `travelMetrics`**

- Semua field sudah di-generate oleh endpoint `/api/objek-wisata/rekomendasi-itinerary`
- Frontend bisa langsung extract response dan gunakan untuk simpan
- Extra field seperti `simpleItinerary`, `route`, `summary` boleh disertakan (tidak error)

```json
{
  "itinerary": {
    "itineraryByDay": [
      {
        "date": "2026-05-06",
        "dayNumber": 1,
        "visits": [
          {
            "id": 1,
            "nama": "Bukit Manado",
            "tipe": "wisata",
            "lat": -1.45,
            "lon": 124.65,
            "jam_buka": "08:00",
            "jam_tutup": "18:00"
          }
        ],
        "schedule": [
          {
            "time": "08:00",
            "activity": "Kunjungan",
            "location": "Bukit Manado",
            "durasi": "02:00"
          },
          {
            "time": "11:30",
            "activity": "Istirahat",
            "location": "Tempat Makan",
            "durasi": "01:00"
          }
        ],
        "totalDistance": 15.5,
        "totalTime": "05:00"
      }
    ],
    "recommendedDestinations": [
      {
        "id": 1,
        "nama": "Bukit Manado",
        "kategori": "alam",
        "deskripsi": "Pemandangan kota Manado",
        "lat": -1.45,
        "lon": 124.65
      }
    ],
    "travelMetrics": {
      "totalDays": 3,
      "totalDistance": 42.3,
      "totalTravelTime": "12:45",
      "totalWisataStops": 6,
      "avgDistancePerDay": 14.1
    }
  },
  "judul_trip": "Trip Manado 3 Hari",
  "tanggal_mulai": "2026-05-06",
  "durasi_hari": 3
}
```

#### Field yang Required:

| Field                               | Tipe   | Deskripsi                                     | Contoh                                       |
| ----------------------------------- | ------ | --------------------------------------------- | -------------------------------------------- |
| `judul_trip`                        | string | Judul perjalanan                              | "Trip Manado 3 Hari"                         |
| `tanggal_mulai`                     | string | Tanggal mulai (ISO 8601: YYYY-MM-DD)          | "2026-05-06"                                 |
| `durasi_hari`                       | number | Jumlah hari perjalanan                        | 3                                            |
| `itinerary.itineraryByDay`          | array  | Array berisi itinerary per hari               | `[{date, dayNumber, visits, schedule, ...}]` |
| `itinerary.recommendedDestinations` | array  | Daftar destinasi wisata yang direkomendasikan | `[{id, nama, kategori, ...}]`                |
| `itinerary.travelMetrics`           | object | Metrik perjalanan (total jarak, waktu, dll)   | `{totalDays, totalDistance, ...}`            |

#### Frontend Transformation Guide (Hanya jika data dari sumber lain):

**CATATAN:** Jika data itinerary datang dari endpoint `/api/objek-wisata/rekomendasi-itinerary`, **TIDAK PERLU transform** - langsung pakai saja. Section ini hanya untuk kasus jika frontend punya data dari sumber lain.

Jika frontend punya struktur internal/lokal:

```javascript
// Frontend internal format (dari LocalStorage atau custom generator)
{
  items: [[...day1], [...day2], [...day3]],
  summary: { totalDays, totalStops, ... }
}
```

**Harus transform menjadi struktur backend:**

```javascript
// Backend expected format
{
  itineraryByDay: [
    { date: '2026-05-06', dayNumber: 1, visits: [...], schedule: [...], ... },
    { date: '2026-05-07', dayNumber: 2, visits: [...], schedule: [...], ... },
    { date: '2026-05-08', dayNumber: 3, visits: [...], schedule: [...], ... },
  ],
  recommendedDestinations: [
    { id: 1, nama: 'Bukit Manado', kategori: 'alam', ... },
    { id: 2, nama: 'Taman Laut', kategori: 'alam', ... },
  ],
  travelMetrics: {
    totalDays: 3,
    totalDistance: 42.3,
    totalTravelTime: '12:45',
    totalWisataStops: 6,
    avgDistancePerDay: 14.1
  }
}
```

### Response Sukses (201 Created)

Setelah disimpan, backend menggunakan **Approach 3 - Minimal Data Structure** untuk efisiensi storage:

```json
{
  "message": "Rencana perjalanan berhasil disimpan",
  "data": {
    "id": "aa33a164-6c6d-4d0a-ba09-5043d248523f",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "judul_trip": "Trip Manado 3 Hari",
    "tanggal_mulai": "2026-05-06",
    "durasi_hari": 3,
    "data_itinerary": {
      "visitList": [
        {
          "visitOrder": 1,
          "wisataId": 1,
          "visitType": "wisata",
          "dayNumber": 1,
          "startTime": "08:00",
          "duration": "02:00",
          "distanceFromPrevious": 0
        },
        {
          "visitOrder": 2,
          "wisataId": null,
          "visitType": "food",
          "dayNumber": 1,
          "startTime": "11:30",
          "duration": "01:30",
          "distanceFromPrevious": 5.2,
          "customName": "Restoran Coto Manado"
        },
        {
          "visitOrder": 3,
          "wisataId": 2,
          "visitType": "wisata",
          "dayNumber": 1,
          "startTime": "14:00",
          "duration": "02:30",
          "distanceFromPrevious": 3.1
        },
        {
          "visitOrder": 4,
          "wisataId": null,
          "visitType": "accommodation",
          "dayNumber": 1,
          "startTime": "17:00",
          "duration": "12:00",
          "distanceFromPrevious": 2.5,
          "customName": "Hotel Manado Soft"
        }
      ],
      "summary": {
        "totalDays": 3,
        "totalDistance": 68.4,
        "totalWisataStops": 6,
        "avgDistancePerDay": 22.8
      },
      "generatedAt": "2026-05-06T10:30:00Z"
    },
    "progres_kunjungan": {},
    "created_at": "2026-05-06T10:30:00Z",
    "updated_at": "2026-05-06T10:30:00Z"
  }
}
```

#### Penjelasan Struktur `data_itinerary` (Approach 3)

**Mengapa Minimal Structure?**

- Mengurangi storage database dari 50-100KB menjadi ~1KB per trip
- Performa query lebih cepat
- Detail data (nama, harga, deskripsi) dapat diambil on-demand dari tabel `objek_wisata`
- Lebih scalable untuk jutaan trips

**Field `visitList`** - Array minimal setiap kunjungan:

| Field                  | Tipe           | Deskripsi                                           | Contoh                 |
| ---------------------- | -------------- | --------------------------------------------------- | ---------------------- |
| `visitOrder`           | number         | Urutan kunjungan (1, 2, 3, ...)                     | 1                      |
| `wisataId`             | number \| null | ID dari tabel `objek_wisata`, null jika non-DB item | 1 atau null            |
| `visitType`            | string         | Tipe tempat: "wisata", "food", "accommodation"      | "wisata"               |
| `dayNumber`            | number         | Hari keberapa (1, 2, 3, ...)                        | 1                      |
| `startTime`            | string         | Waktu mulai (HH:MM)                                 | "08:00"                |
| `duration`             | string         | Durasi kunjungan (HH:MM)                            | "02:00"                |
| `distanceFromPrevious` | number         | Jarak dari kunjungan sebelumnya (km)                | 5.2                    |
| `customName`           | string         | **Optional** - Nama custom untuk food/accommodation | "Restoran Coto Manado" |

**Deteksi `visitType` Otomatis:**

- Backend mendeteksi type berdasarkan nama tempat:
  - **"wisata"**: Destinasi wisata (default jika ID ada di `objek_wisata`)
  - **"food"**: Keyword: resto, restaurant, makan, kuliner, cafe, warung, bakery
  - **"accommodation"**: Keyword: hotel, akomodasi, penginapan, villa, homestay, resort, lodge, inn, cottage, bed

**Field `summary`** - Ringkasan perjalanan:

| Field               | Tipe   | Deskripsi                     |
| ------------------- | ------ | ----------------------------- |
| `totalDays`         | number | Total hari perjalanan         |
| `totalDistance`     | number | Total jarak tempuh (km)       |
| `totalWisataStops`  | number | Jumlah wisata yang dikunjungi |
| `avgDistancePerDay` | number | Rata-rata jarak per hari (km) |

#### Frontend - Menampilkan Detail (On-Demand Enrichment)

Karena data disimpan minimal, frontend perlu fetch detail wisata saat ditampilkan:

```javascript
// 1. Ambil saved trip dari API
const tripResp = await fetch(`/api/rencana-perjalanan/${tripId}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const { data: trip } = await tripResp.json();

// 2. Extract wisataIds dari visitList
const wisataIds = trip.data_itinerary.visitList
  .filter((v) => v.wisataId !== null)
  .map((v) => v.wisataId);

// 3. Fetch detail dari objek_wisata
const detailResp = await fetch(`/api/objek-wisata?ids=${wisataIds.join(",")}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const { data: wisataDetails } = await detailResp.json();

// 4. Enrich visitList dengan detail
const enrichedVisits = trip.data_itinerary.visitList.map((visit) => {
  if (visit.visitType === "wisata" && visit.wisataId) {
    const detail = wisataDetails.find((w) => w.id === visit.wisataId);
    return {
      ...visit,
      nama: detail.nama,
      deskripsi: detail.deskripsi,
      harga_tiket: detail.harga_tiket,
      jam_buka: detail.jam_buka,
      jam_tutup: detail.jam_tutup,
      lat: detail.lat,
      lon: detail.lon,
    };
  } else if (
    visit.visitType === "food" ||
    visit.visitType === "accommodation"
  ) {
    // Gunakan customName yang sudah disimpan
    return {
      ...visit,
      nama: visit.customName,
    };
  }
  return visit;
});

// 5. Sekarang enrichedVisits siap untuk ditampilkan UI
```

### Response Error

**401 Unauthorized**

```json
{
  "message": "Unauthorized: token tidak ditemukan"
}
```

**400 Bad Request** - Berbagai kemungkinan input error:

```json
{
  "message": "Gagal menyimpan rencana perjalanan",
  "error": "Itinerary wajib ada dan harus berupa object"
}
```

Kemungkinan error lain dengan solusinya:

| Error Message                                                    | Penyebab                                                      | Solusi                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `"itinerary wajib ada dan harus berupa object"`                  | Field `itinerary` missing atau bukan object                   | Pastikan `itinerary` adalah object dari response generate endpoint |
| `"judul_trip wajib ada dan harus berupa string"`                 | Field `judul_trip` missing atau bukan string                  | Isi `judul_trip` dengan string, contoh: "Trip Manado 3 Hari"       |
| `"tanggal_mulai wajib ada dan harus berupa string (YYYY-MM-DD)"` | Field `tanggal_mulai` missing atau format salah               | Gunakan format YYYY-MM-DD, contoh: "2026-05-06"                    |
| `"durasi_hari wajib ada dan harus berupa number >= 1"`           | Field `durasi_hari` missing atau < 1                          | Isi dengan number >= 1, contoh: 3                                  |
| `"Itinerary harus memiliki itineraryByDay array"`                | Struktur `itinerary` tidak lengkap (missing `itineraryByDay`) | Pastikan dari generate endpoint sebelum save                       |

**500 Internal Server Error**

```json
{
  "message": "Gagal menyimpan rencana perjalanan",
  "error": "Deskripsi error dari server"
}
```

Hubungi backend team jika mendapat 500 error. Possible causes:

- Database connection issue
- UUID mismatch antara token dan database

### Contoh cURL

```bash
curl -X POST http://localhost:4000/api/rencana-perjalanan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "itinerary": {
      "itineraryByDay": [...],
      "recommendedDestinations": [...],
      "travelMetrics": {...}
    },
    "judul_trip": "Trip Manado 3 Hari",
    "tanggal_mulai": "2026-05-06",
    "durasi_hari": 3
  }'
```

### Contoh JavaScript/Node.js

#### Contoh Realistic: Generate → Simpan (Alur Normal):

```javascript
// 1. Login
const loginResp = await fetch("http://localhost:4000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "user@example.com", password: "pass123" }),
});
const { token } = await loginResp.json();

// 2. Generate itinerary
const genResp = await fetch(
  "http://localhost:4000/api/objek-wisata/rekomendasi-itinerary",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      startingPoint: { lat: -1.45, lon: 124.65 },
      durasi_hari: 3,
      minatKategori: ["alam", "budaya"],
    }),
  },
);
const { data: itinerary } = await genResp.json();

// 3. Simpan hasil generate - LANGSUNG, TIDAK PERLU TRANSFORM!
const saveResp = await fetch("http://localhost:4000/api/rencana-perjalanan", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    itinerary, // ✨ LANGSUNG PAKAI DARI GENERATE!
    judul_trip: "Trip Manado 3 Hari",
    tanggal_mulai: "2026-05-06",
    durasi_hari: 3,
  }),
});

const result = await saveResp.json();
if (saveResp.ok) {
  console.log("✅ Saved! Trip ID:", result.data.id);
} else {
  console.error("❌ Error:", result.error);
}
```

✨ **Fleksibel!** Backend generate endpoint sudah return format yang benar. Frontend tidak perlu transform manual - langsung simpan hasilnya!

#### Contoh lama: Transformation (Jika data dari sumber lain):

```javascript
// Hanya jika frontend punya data dari sumber lain (misal LocalStorage)
// JANGAN gunakan jika data dari /api/objek-wisata/rekomendasi-itinerary!
const internalFormat = {
  items: [[...day1_items], [...day2_items], [...day3_items]],
  summary: {
    totalDays: 3,
    totalStops: 6,
    totalDistance: 42.5,
    totalTime: "12:45",
  },
};

// Transform ke backend format
const backendFormat = {
  itineraryByDay: internalFormat.items.map((dayItems, idx) => ({
    date: "2026-05-06",
    dayNumber: idx + 1,
    visits: dayItems.filter((item) => item.type === "wisata"),
    schedule: dayItems.map((item) => ({
      time: item.time,
      activity: item.type === "wisata" ? "Kunjungan" : "Istirahat",
      location: item.name,
      durasi: item.duration || "01:00",
    })),
    totalDistance: 15.5,
    totalTime: "05:00",
  })),
  recommendedDestinations: internalFormat.items
    .flat()
    .filter((item) => item.type === "wisata")
    .map((item) => ({
      id: item.id,
      nama: item.name,
      kategori: "alam",
      deskripsi: item.description || "",
      lat: item.lat || 0,
      lon: item.lon || 0,
    })),
  travelMetrics: {
    totalDays: internalFormat.summary.totalDays,
    totalDistance: internalFormat.summary.totalDistance,
    totalTravelTime: internalFormat.summary.totalTime,
    totalWisataStops: internalFormat.summary.totalStops,
    avgDistancePerDay:
      internalFormat.summary.totalDistance / internalFormat.summary.totalDays,
  },
};

// Kirim ke API
const response = await fetch("http://localhost:4000/api/rencana-perjalanan", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    itinerary: backendFormat,
    judul_trip: "Trip Manado 3 Hari",
    tanggal_mulai: "2026-05-06",
    durasi_hari: 3,
  }),
});

const data = await response.json();
console.log("Trip ID:", data.data?.id);
```

### Catatan Penting

- **User ID**: Diambil otomatis dari token JWT
- **Progres Kunjungan**: Dimulai sebagai object kosong `{}`
- **Trip ID**: UUID unik untuk setiap perjalanan
- **Approach 3**: Data disimpan minimal (~1KB), detail diambil on-demand
- **visitType**: Otomatis dideteksi berdasarkan nama tempat
- **Frontend Enrichment**: Frontend perlu fetch detail wisata dari `/api/objek-wisata/:id` saat menampilkan UI

### Workflow Lengkap: Dari Generate Sampai Display

```javascript
// ========== STEP 1: Login ==========
const token = await login("user@example.com", "password");

// ========== STEP 2: Generate Itinerary ==========
const genResp = await fetch("/api/objek-wisata/rekomendasi-itinerary", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    startingPoint: { lat: -1.45, lon: 124.65 },
    durasi_hari: 3,
    minatKategori: ["alam", "budaya"],
  }),
});
const { data: fullItinerary } = await genResp.json();
// fullItinerary memiliki: itineraryByDay, recommendedDestinations, travelMetrics
// Frontend bisa tampilkan untuk preview

// ========== STEP 3: Save ke Database ==========
const saveResp = await fetch("/api/rencana-perjalanan", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    itinerary: fullItinerary, // ← Langsung pakai dari generate!
    judul_trip: "Trip Manado 3 Hari",
    tanggal_mulai: "2026-05-06",
    durasi_hari: 3,
  }),
});
const { data: savedTrip } = await saveResp.json();
const tripId = savedTrip.id;
// Backend otomatis extract visitList + summary
// Disimpan ke data_itinerary sebagai struktur minimal

// ========== STEP 4: Gunakan Saved Trip Data untuk Display ==========
// Response save endpoint sudah return seluruh trip data
// Format dari savedTrip.data_itinerary:
// {
//   visitList: [{visitOrder, wisataId, visitType, dayNumber, ...}],
//   summary: {totalDays, totalDistance, ...},
//   generatedAt: "..."
// }

const trip = savedTrip; // Sudah ada di response save!

// ========== STEP 5: Enrich Data untuk Display ==========
// Kumpulkan semua wisataId yang perlu detail
const wisataIds = trip.data_itinerary.visitList
  .filter((v) => v.wisataId !== null && v.visitType === "wisata")
  .map((v) => v.wisataId);

// Fetch detail wisata (hanya untuk ID yang ada)
const detailsResp = await fetch(
  `/api/objek-wisata?ids=${wisataIds.join(",")}`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const { data: wisataDetails } = await detailsResp.json();

// Buat map untuk lookup cepat
const wisataMap = Object.fromEntries(wisataDetails.map((w) => [w.id, w]));

// Enrich visitList dengan detail
const enrichedVisits = trip.data_itinerary.visitList.map((visit) => {
  if (visit.visitType === "wisata" && visit.wisataId) {
    const detail = wisataMap[visit.wisataId];
    return {
      ...visit,
      nama: detail.nama,
      deskripsi: detail.deskripsi,
      harga_tiket: detail.harga_tiket,
      jam_buka: detail.jam_buka,
      jam_tutup: detail.jam_tutup,
      lat: detail.lat,
      lon: detail.lon,
    };
  } else {
    // Food atau accommodation, gunakan customName
    return {
      ...visit,
      nama: visit.customName,
    };
  }
});

// ========== STEP 6: Tampilkan UI ==========
displayItinerary({
  title: trip.judul_trip,
  dates: trip.tanggal_mulai,
  duration: trip.durasi_hari,
  summary: trip.data_itinerary.summary,
  visits: enrichedVisits, // ← Data lengkap, siap render
});
```

**Optimasi: Setiap kali load saved trip:**

```javascript
// Opsi 1: Cache di localStorage / Redux / Vuex
localStorage.setItem(`trip_${tripId}`, JSON.stringify(savedTrip));

// Opsi 2: Jika perlu fresh data, buat endpoint GET
// (Saat ini endpoint ini belum ada - perlu request ke backend)
// GET /api/rencana-perjalanan/:id
// Response: { data: { id, judul_trip, data_itinerary, ... } }
```

---

## Update Progress Kunjungan

### Endpoint

```

PATCH /api/rencana-perjalanan/:id/progres-kunjungan

```

### Deskripsi

Mengupdate status kunjungan wisata dalam perjalanan. **User biasa BISA menggunakan endpoint ini.** Memungkinkan menandai wisata mana saja yang sudah dikunjungi dan berapa banyak yang belum.

⚠️ **PENTING**: Endpoint ini **BUKAN** admin-only. User biasa (`role='user'`) sepenuhnya bisa mengakses endpoint ini untuk melacak progress perjalanan mereka sendiri.

### Parameter URL

- `id` (string, required): Trip ID dari rencana perjalanan (format UUID)

### Authentication

- **Tipe**: Bearer Token (JWT)
- **Cara**: Kirim di header `Authorization: Bearer <token>` atau di cookie `token`

### Request Body

```json
{
  "leaveLastUnvisitedCount": 2
}
```

**Penjelasan**:

- `leaveLastUnvisitedCount` (number, required): Jumlah wisata yang ingin ditinggalkan belum dikunjungi
  - Contoh: jika ada 6 wisata dan value = 2, maka 4 wisata pertama ditandai "dikunjungi", 2 terakhir "belum dikunjungi"

### Response Sukses (200 OK)

```json
{
  "message": "Progres kunjungan berhasil diupdate",
  "data": {
    "id": "aa33a164-6c6d-4d0a-ba09-5043d248523f",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "judul_trip": "Trip Manado 3 Hari",
    "progres_kunjungan": {
      "totalStops": 6,
      "visitedStopIds": [1, 2, 3, 4],
      "remainingStops": 2,
      "lastVisitedAt": "2026-05-07T15:30:00Z",
      "byDay": {
        "2026-05-06": {
          "status": "completed",
          "totalStops": 2,
          "completedStopIds": [1, 2]
        },
        "2026-05-07": {
          "status": "in_progress",
          "totalStops": 3,
          "completedStopIds": [3, 4]
        },
        "2026-05-08": {
          "status": "not_started",
          "totalStops": 1,
          "completedStopIds": []
        }
      }
    }
  }
}
```

### Struktur `progres_kunjungan`

#### Level Utama

| Field            | Tipe              | Deskripsi                           |
| ---------------- | ----------------- | ----------------------------------- |
| `totalStops`     | number            | Total jumlah wisata dalam trip      |
| `visitedStopIds` | array             | ID wisata yang sudah dikunjungi     |
| `remainingStops` | number            | Jumlah wisata yang belum dikunjungi |
| `lastVisitedAt`  | string (ISO 8601) | Timestamp kunjungan terakhir        |
| `byDay`          | object            | Detail progress per hari            |

#### Detail `byDay`

Untuk setiap tanggal:

```json
{
  "YYYY-MM-DD": {
    "status": "completed|in_progress|not_started",
    "totalStops": 2,
    "completedStopIds": [1, 2]
  }
}
```

**Status Values**:

- `completed`: Semua wisata di hari itu sudah dikunjungi
- `in_progress`: Sebagian wisata sudah dikunjungi, ada yang belum
- `not_started`: Belum ada wisata yang dikunjungi di hari itu

### Response Error

**401 Unauthorized**

```json
{
  "message": "Unauthorized: token tidak ditemukan"
}
```

**404 Not Found**

```json
{
  "message": "Rencana perjalanan tidak ditemukan",
  "error": "Trip dengan ID tersebut tidak ada"
}
```

**400 Bad Request**

```json
{
  "message": "Invalid request",
  "error": "leaveLastUnvisitedCount harus angka positif"
}
```

### Contoh cURL

```bash
curl -X PATCH http://localhost:4000/api/rencana-perjalanan/aa33a164-6c6d-4d0a-ba09-5043d248523f/progres-kunjungan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "leaveLastUnvisitedCount": 2
  }'
```

### Contoh JavaScript/Node.js

```javascript
const token = "eyJhbGc..."; // dari login response
const tripId = "aa33a164-6c6d-4d0a-ba09-5043d248523f"; // dari save itinerary

const response = await fetch(
  `http://localhost:4000/api/rencana-perjalanan/${tripId}/progres-kunjungan`,
  {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      leaveLastUnvisitedCount: 2,
    }),
  },
);

const data = await response.json();
console.log("Progres kunjungan:", data.data.progres_kunjungan);

// Contoh output:
// {
//   totalStops: 6,
//   visitedStopIds: [1, 2, 3, 4],
//   remainingStops: 2,
//   lastVisitedAt: '2026-05-07T15:30:00Z',
//   byDay: {
//     '2026-05-06': { status: 'completed', totalStops: 2, completedStopIds: [1, 2] },
//     '2026-05-07': { status: 'in_progress', totalStops: 3, completedStopIds: [3, 4] },
//     '2026-05-08': { status: 'not_started', totalStops: 1, completedStopIds: [] }
//   }
// }
```

### Cara Menggunakan untuk Tracking

```javascript
// 1. Login dan dapatkan token
const loginResp = await fetch("http://localhost:4000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "user@example.com", password: "pass123" }),
});
const { token } = await loginResp.json();

// 2. Generate itinerary
const recResp = await fetch(
  "http://localhost:4000/api/objek-wisata/rekomendasi-itinerary",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      startingPoint: { lat: -1.45, lon: 124.65 },
      durasi_hari: 3,
      minatKategori: ["alam", "budaya"],
    }),
  },
);
const recData = await recResp.json();

// 3. Simpan itinerary
const saveResp = await fetch("http://localhost:4000/api/rencana-perjalanan", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    itinerary: recData.data,
    judul_trip: "My Trip",
    tanggal_mulai: "2026-05-06",
    durasi_hari: 3,
  }),
});
const tripData = await saveResp.json();
const tripId = tripData.data.id;

// 4. Update progress saat traveling
const progressResp = await fetch(
  `http://localhost:4000/api/rencana-perjalanan/${tripId}/progres-kunjungan`,
  {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      leaveLastUnvisitedCount: 2, // 2 wisata belum dikunjungi
    }),
  },
);
const progressData = await progressResp.json();
console.log(progressData.data.progres_kunjungan);
```

---

## Admin Endpoints

### User Roles

Ada 2 role dalam sistem:

- `user`: User biasa, bisa buat dan track itinerary
- `admin`: Admin, bisa manage data wisata, kategori, tempat makan, akomodasi

### Admin Routes (Memerlukan `role: 'admin'`)

#### Admin Wisata Management

```
GET    /api/admin/wisata                  - List semua wisata
GET    /api/admin/wisata/:id              - Detail wisata
GET    /api/admin/wisata/kurasi/:section  - Lihat isi kurasi section (populer/hidden_gem/baru)
POST   /api/admin/wisata                  - Buat wisata baru
PUT    /api/admin/wisata/kurasi/:section  - Ganti total daftar kurasi section
PATCH  /api/admin/wisata/:id              - Update wisata
PATCH  /api/admin/wisata/:id/popularity   - Atur label populer/hidden_gem/netral
DELETE /api/admin/wisata/:id              - Hapus wisata
```

Contoh body untuk endpoint popularity:

```json
{
  "popularityStatus": "hidden_gem"
}
```

Contoh body untuk set daftar kurasi section (admin pilih manual item yang ditampilkan di web):

```json
{
  "wisataIds": [12, 7, 33, 2, 18]
}
```

`section` yang didukung: `populer`, `hidden_gem`, `baru`.

### User Curated Wisata (Publik)

```
GET /api/objek-wisata/populer
GET /api/objek-wisata/hidden-gem
GET /api/objek-wisata/wisata-baru
GET /api/objek-wisata/kurasi/:section
```

Semua endpoint di atas mendukung query `?limit=5` (default 5, maksimum 50).

#### Admin Kategori Management

```
GET    /api/admin/kategori                - List kategori
POST   /api/admin/kategori                - Buat kategori
PATCH  /api/admin/kategori/:id            - Update kategori
DELETE /api/admin/kategori/:id            - Hapus kategori
```

#### Admin Tempat Makan Management

```
GET    /api/admin/tempat-makan           - List tempat makan
POST   /api/admin/tempat-makan           - Buat tempat makan
PATCH  /api/admin/tempat-makan/:id       - Update tempat makan
DELETE /api/admin/tempat-makan/:id       - Hapus tempat makan
```

#### Admin Akomodasi Management

```
GET    /api/admin/akomodasi              - List akomodasi
POST   /api/admin/akomodasi              - Buat akomodasi
PATCH  /api/admin/akomodasi/:id          - Update akomodasi
DELETE /api/admin/akomodasi/:id          - Hapus akomodasi
```

### Akses Admin Endpoint

**Response jika user BUKAN admin:**

```json
{
  "message": "Forbidden: Admin only"
}
```

---

## Troubleshooting

### Error: "Forbidden: Admin only"

#### ⚠️ CATATAN PENTING:

**User biasa (`role='user'`) TIDAK perlu admin** untuk:

- ✅ Simpan itinerary (POST /api/rencana-perjalanan)
- ✅ Update progress (PATCH /api/rencana-perjalanan/:id/progres-kunjungan)

Jika mendapat "Forbidden: Admin only" saat melakukan aksi di atas, **frontend-nya yang salah memanggil endpoint admin!**

#### Kemungkinan 1: Frontend Memanggil Endpoint Admin (YANG SALAH!)

**Gejala**: Tombol "Simpan Itinerary" atau "Update Progress" menampilkan error "Forbidden: Admin only"

**Penyebab**: Frontend seharusnya memanggil:

- ❌ `/api/admin/wisata` (admin-only)
- ❌ `/api/admin/kategori` (admin-only)
- ❌ `/api/admin/tempat-makan` (admin-only)
- ❌ `/api/admin/akomodasi` (admin-only)

Padahal seharusnya memanggil:

- ✅ `/api/rencana-perjalanan` (user-only untuk simpan)
- ✅ `/api/rencana-perjalanan/:id/progres-kunjungan` (user-only untuk tracking)

**Solusi**:

1. **Periksa kode frontend** di function `confirmItineraryToDatabase` (dari `@/lib/perjalanan/itinerary-confirm`)
2. **Verifikasi endpoint URL** yang dikirim - harus `/api/rencana-perjalanan`, BUKAN `/api/admin/*`
3. **Cek Network tab browser** (F12 → Network) saat error, lihat URL yang dipanggil
4. **Fix frontend code** untuk memanggil endpoint user biasa yang benar

#### Kemungkinan 2: Token Tidak Ada atau Expired (Error Berbeda)

**Gejala**: Mendapat error **"Unauthorized: token tidak ditemukan"** (bukan "Forbidden")

**Penyebab**: Token JWT belum dikirim atau sudah expired

**Solusi**:

1. Login dulu untuk dapatkan token
2. Kirim token di header: `Authorization: Bearer <token>` atau sebagai cookie `token`
3. Jika token expired, login ulang untuk mendapat token baru

### Debug: Cek Role User saat Login

Untuk memverifikasi role user dan endpoint mana saja yang bisa diakses:

```javascript
// Login untuk dapatkan token
const loginResp = await fetch("http://localhost:4000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "lex@gmail.com", password: "pass123" }),
});

const loginData = await loginResp.json();
const userRole = loginData.data.role;

console.log("Email:", loginData.data.email);
console.log("Role:", userRole);
console.log("Token:", loginData.token);

// Jika role = 'user' (user biasa):
if (userRole === "user") {
  console.log("✅ Bisa akses:");
  console.log("   - POST /api/rencana-perjalanan (simpan itinerary)");
  console.log(
    "   - PATCH /api/rencana-perjalanan/:id/progres-kunjungan (tracking)",
  );
  console.log("   - POST /api/objek-wisata/rekomendasi-itinerary (generate)");
  console.log("❌ TIDAK bisa akses:");
  console.log("   - /api/admin/*");
}

// Jika role = 'admin':
if (userRole === "admin") {
  console.log("✅ Bisa akses semua endpoint termasuk /api/admin/*");
}
```

### Debug: Lihat User di Database

```sql
-- Cek user dan rolenya
SELECT id, email, role FROM users WHERE email = 'user@example.com';

-- Ubah role jadi admin
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';

-- Ubah role jadi user biasa
UPDATE users SET role = 'user' WHERE email = 'user@example.com';
```

### Troubleshooting Approach 3 - Data Storage

#### Error: "Tidak ada visits ditemukan dalam itinerary"

**Penyebab**: Itinerary yang dikirim tidak memiliki field `itineraryByDay` atau `itineraryByDay` kosong

**Solusi**:

```javascript
// ❌ SALAH - Mengirim itinerary yang incomplete
const saveResp = await fetch("/api/rencana-perjalanan", {
  method: "POST",
  body: JSON.stringify({
    itinerary: {
      // Missing itineraryByDay!
      recommendedDestinations: [...],
      travelMetrics: {...}
    }
  })
});

// ✅ BENAR - Gunakan data dari generate endpoint
const genResp = await fetch("/api/objek-wisata/rekomendasi-itinerary", {...});
const { data: fullItinerary } = await genResp.json();
// fullItinerary PASTI punya itineraryByDay dengan visits

const saveResp = await fetch("/api/rencana-perjalanan", {
  method: "POST",
  body: JSON.stringify({
    itinerary: fullItinerary  // ← Langsung dari generate!
  })
});
```

#### Error: "visitType harus salah satu dari: wisata, food, accommodation"

**Penyebab**: Backend menemukan `visitType` yang tidak valid (bug internal)

**Solusi**: Hubungi backend team - ini adalah internal validation error yang seharusnya tidak terjadi jika generate endpoint bekerja dengan baik.

#### Data Stored Terlalu Besar (Tidak Optimal)

**Tanda**: Melihat full itinerary disimpan di database (50-100KB) bukan minimal structure

**Penyebab**: Mungkin endpoint save belum di-update dengan Approach 3

**Solusi**:

```javascript
// Verifikasi response save endpoint
const saveResp = await fetch("/api/rencana-perjalanan", {...});
const saved = await saveResp.json();

// data_itinerary harus punya struktur minimal:
// {
//   visitList: [compact visits],
//   summary: {totalDays, totalDistance, ...}
// }

// BUKAN full itinerary lengkap:
// {
//   itineraryByDay: [...full],
//   recommendedDestinations: [...full],
//   travelMetrics: {...}
// }

if (saved.data.data_itinerary.visitList) {
  console.log("✅ Menggunakan Approach 3 - Minimal structure");
} else {
  console.error("❌ Data belum menggunakan Approach 3");
}
```

#### Frontend Display Error: "customName undefined untuk Food/Accommodation"

**Penyebab**: Saat enrich data, lupa handle `customName` field untuk non-wisata items

**Solusi**:

```javascript
// ❌ SALAH
const enriched = trip.data_itinerary.visitList.map((visit) => {
  if (visit.wisataId) {
    // fetch detail wisata
    return { ...visit, ...wisataDetail };
  }
  // Lupa handle customName!
});

// ✅ BENAR
const enriched = trip.data_itinerary.visitList.map((visit) => {
  if (visit.visitType === "wisata" && visit.wisataId) {
    const detail = wisataMap[visit.wisataId];
    return {
      ...visit,
      nama: detail.nama,
      // ... other fields
    };
  } else if (
    visit.visitType === "food" ||
    visit.visitType === "accommodation"
  ) {
    // Gunakan customName yang sudah disimpan
    return {
      ...visit,
      nama: visit.customName, // ← Ini yang penting!
    };
  }
});
```

---

## HTTP Status Codes

| Code | Meaning                          | Contoh                                |
| ---- | -------------------------------- | ------------------------------------- |
| 200  | OK - Sukses                      | Update progress, get data             |
| 201  | Created - Resource baru dibuat   | Simpan itinerary baru                 |
| 400  | Bad Request - Input tidak valid  | Body JSON salah format                |
| 401  | Unauthorized - Tidak autentikasi | Token tidak ada/expired               |
| 403  | Forbidden - Akses ditolak        | User bukan admin tapi akses /admin/\* |
| 404  | Not Found - Resource tidak ada   | Trip ID tidak ditemukan               |
| 500  | Server Error - Error di server   | Database connection error             |

---

## Environment Variables

Pastikan `.env` di server memiliki:

```
DATABASE_URL=<supabase-connection-string>
JWT_SECRET=<secret-key-untuk-jwt>
PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
```

---

## Database Schema

### Table: rencana_perjalanan

```sql
CREATE TABLE rencana_perjalanan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  judul_trip VARCHAR(255) NOT NULL,
  tanggal_mulai DATE NOT NULL,
  durasi_hari INTEGER NOT NULL,
  data_itinerary JSONB NOT NULL,
  progres_kunjungan JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table: users (Public)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  nama VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  minat_kategori JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Kontak & Support

Untuk pertanyaan teknis atau bug report, silakan cek:

- [GitHub Issues]
- Email: support@example.com
