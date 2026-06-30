const TIME_SLOT_MINUTES = 15;
const DEFAULT_TRAVEL_DAYS = 1;
const DEFAULT_VISIT_DURATION_MODE = "kategori";
const MIN_VISIT_DURATION_MINUTES = 60;
const MIN_VISIT_DURATION_RATIO = 0.6;

function parseFlexibleClockToMinutes(clockValue) {
  if (!clockValue) return null;

  const clock = String(clockValue).trim();
  // Regex dibebaskan dari ^ dan $ agar mengabaikan teks tambahan seperti "WITA" atau spasi
  const match = clock.match(/(\d{1,2})[:.](\d{2})/);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
}

function formatMinutesToClock(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return null;

  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minute = String(normalized % 60).padStart(2, "0");

  return `${hour}:${minute}`;
}

function normalizeOperatingHoursText(rawText, parsedHours) {
  if (rawText) {
    const compact = String(rawText)
      .replace(/\s*-\s*/, " - ")
      .trim();
    if (compact.length > 0) return compact;
  }

  if (!parsedHours) return null;

  const startText = formatMinutesToClock(parsedHours.startMinutes);
  const endText = formatMinutesToClock(parsedHours.endMinutes);

  if (!startText || !endText) return null;
  return `${startText} - ${endText}`;
}

function parseOperatingHours(value) {
  if (!value) return null;

  const raw = String(value).trim();
  const parts = raw.split("-");

  if (parts.length !== 2) return null;

  const startMinutes = parseFlexibleClockToMinutes(parts[0]);
  const endMinutes = parseFlexibleClockToMinutes(parts[1]);

  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  return {
    raw,
    startMinutes,
    endMinutes,
    isOvernight: endMinutes <= startMinutes && !(startMinutes === 0 && endMinutes === 0),
  };
}

function buildDateAtMinutes(baseDate, totalMinutes) {
  const date = new Date(baseDate);
  date.setUTCHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return date;
}

function buildOperatingWindowForDate(operatingHours, referenceDate) {
  if (!operatingHours) return null;

  const start = buildDateAtMinutes(referenceDate, operatingHours.startMinutes);
  const end = buildDateAtMinutes(referenceDate, operatingHours.endMinutes);

  // Guard khusus 24 Jam
  if (operatingHours.startMinutes === 0 && operatingHours.endMinutes === 0) {
      end.setDate(end.getDate() + 1);
      return { start, end };
  }

  if (operatingHours.isOvernight || end <= start) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

function addMinutesToDate(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function roundUpToTimeSlot(value, slotMinutes = TIME_SLOT_MINUTES) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / slotMinutes) * slotMinutes;
}

function roundDownToTimeSlot(value, slotMinutes = TIME_SLOT_MINUTES) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value / slotMinutes) * slotMinutes;
}

function alignDateToTimeSlot(
  date,
  mode = "up",
  slotMinutes = TIME_SLOT_MINUTES,
) {
  const aligned = new Date(date);
  aligned.setSeconds(0, 0);

  const totalMinutes = aligned.getUTCHours() * 60 + aligned.getUTCMinutes();
  const roundedMinutes =
    mode === "down"
      ? roundDownToTimeSlot(totalMinutes, slotMinutes)
      : roundUpToTimeSlot(totalMinutes, slotMinutes);

  aligned.setUTCHours(0, 0, 0, 0);
  aligned.setUTCMinutes(roundedMinutes);
  return aligned;
}

function dateDiffMinutes(later, earlier) {
  return (later.getTime() - earlier.getTime()) / 60000;
}

function parseClockToMinutes(value) {
  if (!value) return null;

  const clock = String(value).trim();
  const match = clock.match(/(\d{1,2}):(\d{2})/);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
}

function formatLocalDate(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Tambahkan parameter startDateStr agar bisa membaca input form (misal: "2026-04-28")
function buildDailyActiveWindowsFromForm(dayCount, startClock, endClock, startDateStr = null) {
  const startMinutes = parseClockToMinutes(startClock);
  const endMinutes = parseClockToMinutes(endClock);

  if (startMinutes === null || endMinutes === null) {
    throw new Error("Format jamMulai atau jamBerakhir tidak valid (HH:mm)");
  }

  if (endMinutes <= startMinutes) {
    throw new Error("jamBerakhir harus lebih besar dari jamMulai");
  }

  const totalDays = Number(dayCount);

  if (!Number.isFinite(totalDays) || totalDays < 1) {
    throw new Error("jumlahHariWisata wajib angka dan minimal 1");
  }

  const normalizedDays = Math.floor(totalDays);
  const windows = [];
  
  // Gunakan tanggal dari input form, jika tidak ada fallback ke hari ini
  let baseDate = startDateStr ? new Date(startDateStr) : new Date();
  if (isNaN(baseDate.getTime())) {
      baseDate = new Date();
  }
  baseDate.setUTCHours(0, 0, 0, 0);

  for (let dayOffset = 0; dayOffset < normalizedDays; dayOffset += 1) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + dayOffset);

    const start = new Date(date);
    start.setUTCHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

    const end = new Date(date);
    end.setUTCHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

    windows.push({
      date: formatLocalDate(date),
      start,
      end,
      availableMinutes: (end.getTime() - start.getTime()) / 60000,
    });
  }

  return windows;
}

function resolveVisitDurationMode(input, getFirstAvailableValue) {
  const rawMode = getFirstAvailableValue(input, [
    "modeDurasiKunjungan",
    "visitDurationMode",
  ]);

  if (!rawMode) return DEFAULT_VISIT_DURATION_MODE;

  const normalized = String(rawMode).trim().toLowerCase();

  if (
    ["kategori", "category", "rule", "aturan", "fixed"].includes(normalized)
  ) {
    return "kategori";
  }

  if (["data", "raw", "csv", "estimasi"].includes(normalized)) {
    return "data";
  }

  if (["hybrid", "campuran", "mix"].includes(normalized)) {
    return "hybrid";
  }

  throw new Error(
    "modeDurasiKunjungan tidak valid. Gunakan: kategori | data | hybrid",
  );
}

function resolveMinimumVisitDurationMinutes(plannedDurationMinutes) {
  const planned = Number(plannedDurationMinutes) || MIN_VISIT_DURATION_MINUTES;
  const ratioBased = roundDownToTimeSlot(planned * MIN_VISIT_DURATION_RATIO);

  return Math.max(MIN_VISIT_DURATION_MINUTES, TIME_SLOT_MINUTES, ratioBased);
}

module.exports = {
  TIME_SLOT_MINUTES,
  DEFAULT_TRAVEL_DAYS,
  DEFAULT_VISIT_DURATION_MODE,
  MIN_VISIT_DURATION_MINUTES,
  MIN_VISIT_DURATION_RATIO,
  parseFlexibleClockToMinutes,
  formatMinutesToClock,
  normalizeOperatingHoursText,
  parseOperatingHours,
  buildDateAtMinutes,
  buildOperatingWindowForDate,
  addMinutesToDate,
  roundUpToTimeSlot,
  roundDownToTimeSlot,
  alignDateToTimeSlot,
  dateDiffMinutes,
  parseClockToMinutes,
  formatLocalDate,
  buildDailyActiveWindowsFromForm,
  resolveVisitDurationMode,
  resolveMinimumVisitDurationMinutes,
};