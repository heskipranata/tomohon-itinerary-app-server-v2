# 🗺️ Dokumentasi API: Alur Perencanaan Wisata (Itinerary Flow)

Dokumen ini merangkum *endpoint*, struktur data (*request/response*), dan panduan integrasi khusus untuk fitur **Itinerary Planner** (Perencanaan Perjalanan Wisata).

---

## Konsep Dasar (Penting untuk Frontend)

Sistem *Itinerary* di backend ini dirancang bersifat **Stateless** (tidak menyimpan status draf ke database). 

**Alur Standar UI Frontend:**
1. **Generate Draft Awal** ➔ Hitung rute awal. Frontend menyimpan respons (draf JSON) ke *State Management* (Redux/Zustand/Local State).
2. **Preview Ganti Wisata** ➔ Menampilkan daftar tempat alternatif. Frontend perlu mengirimkan draf yang ada di *State* ke backend untuk dievaluasi.
3. **Konfirmasi Ganti Wisata** ➔ Memilih tempat baru. Backend membalas dengan draf versi terbaru. Frontend **menimpa** (*replace*) *State* lama dengan draf baru ini.
4. **Finalisasi** ➔ Karena sistem *stateless*, "Finalisasi" atau "Simpan" sepenuhnya dikendalikan di sisi Frontend (misalnya disimpan di *Local Storage*, disubmit ke *endpoint* User Saved Itinerary jika ada, atau sekadar dicetak menjadi PDF).

---

## 1. POST `/api/objek-wisata/rekomendasi-itinerary`
**Tujuan:** Membuat draf rencana wisata dari awal berdasarkan lokasi pengguna dan preferensi.

### 📤 Request Body (Full)
```json
{
  "latitude": 1.234567,
  "longitude": 124.567890,
  "jumlahHariWisata": 2,
  "jamMulai": "08:00",
  "jamBerakhir": "18:00",
  "jenisWisata": [
    "alam", 
    "budaya", 
    "danau"
  ],
  "jumlahTempatWisata": 5,
  "butuhMakanSiang": true,
  "butuhAkomodasi": true,
  "averageSpeedKmh": 30,
  "visitDurationMode": "kategori"
}
```
*Catatan: `visitDurationMode` opsional. Bisa berisi `"kategori"` (default berdasarkan kategori tempat) atau `"data"` (berdasarkan field durasi dari database jika ada).*

### 📥 Response Success (200 OK)
```json
{
  "itineraryByDay": [
    {
      "date": "2026-04-16T00:00:00.000Z",
      "activeWindow": {
        "start": "2026-04-16T01:00:00.000Z",
        "end": "2026-04-16T11:00:00.000Z",
        "availableMinutes": 600
      },
      "visits": [
        {
          "order": 1,
          "destinationId": 14,
          "destinationName": "Bukit Kasih Kanonang",
          "description": "Tempat wisata religius dan pemandangan alam.",
          "ticketPrice": 10000,
          "imageUrl": "https://example.com/image.jpg",
          "locationLabel": "Kanonang, Minahasa",
          "category": "bukit",
          "categories": ["bukit", "alam", "religi"],
          "facilities": ["toilet", "parkir", "warung"],
          "operatingHours": {
            "text": "08:00-18:00",
            "startTime": "08:00",
            "endTime": "18:00"
          },
          "location": {
            "latitude": 1.2589,
            "longitude": 124.7890
          },
          "travel": {
            "from": {
              "latitude": 1.234567,
              "longitude": 124.567890
            },
            "distanceKm": 12.5,
            "estimatedTravelMinutes": 25.5,
            "estimatedTravelSlotMinutes": 30,
            "distanceSource": "road-osrm",
            "osrmDurationMinutes": 22.0,
            "modeledDurationMinutes": 25.0
          },
          "estimatedTravelMinutes": 25.5,
          "estimatedTravelText": "25.5 menit",
          "estimatedTravelSlotMinutes": 30,
          "schedule": {
            "arrivalTime": "2026-04-16T01:30:00.000Z",
            "visitStartTime": "2026-04-16T01:30:00.000Z",
            "visitEndTime": "2026-04-16T04:00:00.000Z",
            "waitingMinutes": 0,
            "operatingHours": "08:00-18:00"
          },
          "estimatedVisitDurationMinutes": 150,
          "travelDurationBonusMinutes": 0,
          "visitDurationSource": "rule-umum",
          "sourceType": "objek_wisata",
          "totalConsumedMinutes": 180,
          "isLunchStop": false,
          "isAccommodationStop": false,
          "priorityReason": "Dipilih karena kombinasi efisien jarak + waktu"
        }
        // ... visits berikutnya (tempat ke-2, ke-3, dst) ...
      ],
      "usedMinutes": 180,
      "remainingMinutes": 420,
      "lunchStop": {
        "requested": true,
        "fulfilled": true,
        "destinationName": "Restoran Danau Tondano",
        "targetWindow": {
          "start": "2026-04-16T04:30:00.000Z",
          "end": "2026-04-16T07:30:00.000Z"
        }
      },
      "lunchRecommendations": [],
      "accommodationStop": {
        "requested": true,
        "fulfilled": false,
        "destinationName": null,
        "targetWindow": null
      },
      "accommodationRecommendations": []
    }
  ],
  "simpleItinerary": [
    {
      "date": "2026-04-16T00:00:00.000Z",
      "visits": [
        {
          "time": "08:30 - 11:00",
          "name": "Bukit Kasih Kanonang",
          "distanceKm": 12.5,
          "estimatedTravelMinutes": 25.5,
          "estimatedTravelText": "25.5 menit",
          "estimatedTravelSlotMinutes": 30,
          "category": "bukit",
          "categories": ["bukit", "alam", "religi"],
          "facilities": ["toilet", "parkir", "warung"],
          "isLunchStop": false,
          "isAccommodationStop": false
        }
      ]
    }
  ],
  "recommendedDestinations": [
    // Object utuh dari semua visit yang ada di dalam itineraryByDay (digabung jadi 1 array datar)
  ],
  "route": {
    "startLocation": {
      "latitude": 1.234567,
      "longitude": 124.567890
    },
    "orderedStops": [
      {
        "order": 1,
        "destinationId": 14,
        "destinationName": "Bukit Kasih Kanonang",
        "latitude": 1.2589,
        "longitude": 124.7890
      }
    ]
  },
  "summary": {
    "activeTourismMinutes": 1200,
    "usedMinutes": 1050,
    "remainingMinutes": 150,
    "totalCandidates": 45,
    "selectedDestinations": 5,
    "selectedTourismDestinations": 4,
    "appliedPreferences": ["alam", "budaya", "danau"],
    "averageSpeedKmh": 30,
    "activeHoursRule": "08:00-18:00",
    "destinationLimit": 5,
    "destinationLimitScope": "wisata-only",
    "visitDurationMode": "kategori",
    "lunchStopRequested": true,
    "lunchWindow": "11:30-14:30",
    "lunchCandidatesFromTempatMakan": 10,
    "lunchStopsFulfilledDays": 2,
    "lunchStopsMissingDays": 0,
    "accommodationRequested": true,
    "accommodationWindow": "17:00-22:00",
    "accommodationCandidatesCount": 5,
    "accommodationFulfilledDays": 0,
    "accommodationMissingDays": 2
  }
}
```

---

## 2. POST `/api/objek-wisata/rekomendasi-itinerary/replacement-preview`
**Tujuan:** Saat User mengklik ikon "Ganti Wisata" (Swap) pada suatu tempat di UI. Endpoint ini bertugas mencari kandidat tempat wisata pengganti yang posisinya berdekatan/searah agar rute secara keseluruhan tidak rusak.

### 📤 Request Body (Full)
```json
{
  "draftItinerary": { 
     "itineraryByDay": [ ... ],
     "summary": { ... },
     "route": { ... }
     // Isi field ini DENGAN SELURUH OBJECT dari response endpoint ke-1 di atas
  },
  "stopId": 14,
  "sameCategoryOnly": true,
  "limit": 5,
  "averageSpeedKmh": 30
}
```
*Catatan: `stopId` adalah `destinationId` dari objek wisata yang ingin DIBUANG/DIGANTI.*

### 📥 Response Success (200 OK)
```json
{
  "message": "...",
  "data": {
    "targetStop": {
      "destinationId": 14,
      "destinationName": "Bukit Kasih Kanonang",
      "category": "bukit",
      "location": {
        "latitude": 1.2589,
        "longitude": 124.7890
      },
      "dayIndex": 0,
      "visitIndex": 0
    },
    "anchors": {
      "prev": null,
      "next": {
        "destinationId": 22,
        "destinationName": "Danau Linow"
      }
    },
    "totalCandidates": 12,
    "sameCategoryOnly": true,
    "limit": 5,
    "basis": {
      "targetTravelMinutes": 15.5
    },
    "alternatives": [
      {
        "destinationId": 35,
        "destinationName": "Puncak Tetetana",
        "category": "bukit",
        "categoryTokens": ["bukit", "alam"],
        "sourceType": "objek_wisata",
        "location": {
          "latitude": 1.3000,
          "longitude": 124.8000
        },
        "extraDistanceKm": 1.2,
        "extraTravelMinutes": 2.4,
        "score": 1.32,
        "reason": "Paling minim gangguan rute"
      },
      {
        "destinationId": 40,
        "destinationName": "Gunung Mahawu",
        "category": "gunung",
        "categoryTokens": ["gunung", "alam"],
        "sourceType": "objek_wisata",
        "location": {
          "latitude": 1.3500,
          "longitude": 124.8500
        },
        "extraDistanceKm": 8.5,
        "extraTravelMinutes": 17.0,
        "score": 9.35,
        "reason": "Paling minim gangguan rute"
      }
    ]
  }
}
```
*Tindakan Frontend: Looping array `data.alternatives` untuk merender pilihan kartu-kartu pengganti kepada User.*

---

## 3. POST `/api/objek-wisata/rekomendasi-itinerary/replacement-confirm`
**Tujuan:** User memilih satu tempat dari opsi *alternatives* di langkah ke-2. Endpoint ini akan memasukkan tempat wisata baru tersebut ke dalam draf, **kemudian menghitung ulang jadwal jam kunjungan secara otomatis**.

### 📤 Request Body (Full)
```json
{
  "draftItinerary": { 
     "itineraryByDay": [ ... ],
     "summary": { ... },
     "route": { ... }
     // Isi field ini DENGAN SELURUH OBJECT draf yang sama (belum diganti)
  },
  "stopId": 14,
  "replacementDestinationId": 35,
  "averageSpeedKmh": 30
}
```
*Catatan: `stopId` adalah `destinationId` yang lama (mau dibuang). `replacementDestinationId` adalah `destinationId` dari tempat alternatif yang dipilih user.*

### 📥 Response Success (200 OK)
```json
{
  "message": "Draft itinerary berhasil diperbarui",
  "data": {
    "targetStop": {
      "destinationId": 14,
      "destinationName": "Bukit Kasih Kanonang",
      ...
    },
    "replacementStop": {
      "destinationId": 35,
      "destinationName": "Puncak Tetetana",
      "category": "bukit",
      "location": {
        "latitude": 1.3000,
        "longitude": 124.8000
      },
      ...
    },
    "updatedDraft": {
      "itineraryByDay": [
         // ... (Ini adalah JSON Struktur DRAF TERBARU)
         // Jadwal jam kunjungan di array ini SUDAH DIKALKULASI ULANG oleh sistem!
      ],
      "simpleItinerary": [
         // ...
      ],
      "recommendedDestinations": [
         // ...
      ],
      "route": {
         // ...
      },
      "summary": {
         // ...
      }
    }
  }
}
```
*Tindakan Frontend: Segera **timpa** state `draftItinerary` lama yang ada di memori Frontend dengan state `data.updatedDraft` yang baru ini.*
