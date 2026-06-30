const supabase = require("../config/supabase");
const {
  haversineDistanceKm,
  distanceToTravelMinutes,
} = require("./wisata/geo-utils");
const {
  normalizeCategoryTokens,
  categoryMatchesPreference,
} = require("./wisata/category-utils");
const { buildWisataDataAccess } = require("./wisata/data-access");
const { buildWisataMappers } = require("./wisata/mappers");
const {
  DEFAULT_TRAVEL_DAYS,
  TIME_SLOT_MINUTES,
  formatMinutesToClock,
  normalizeOperatingHoursText,
  parseOperatingHours,
  buildOperatingWindowForDate,
  addMinutesToDate,
  roundUpToTimeSlot,
  roundDownToTimeSlot,
  alignDateToTimeSlot,
  dateDiffMinutes,
  buildDailyActiveWindowsFromForm,
  resolveVisitDurationMode,
  resolveMinimumVisitDurationMinutes,
  buildDateAtMinutes,
} = require("./wisata/time-utils");
const { getMatrixDistancesFromOsrm } = require("./wisata/osrm-client");

const wisataTable = "objek_wisata";
const kategoriTable = "kategori_wisata";
const tempatMakanTable = "tempat_makan";
const DEFAULT_TRAVEL_SPEED_KMH = 30;
const PRIORITIZE_CLOSING_THRESHOLD_MINUTES = 120;
const GREEDY_NEAREST_PREFILTER_SIZE = 12;
const GREEDY_NEAREST_POOL_MULTIPLIER = 6;
const GREEDY_NEAREST_POOL_MIN = 20;
const LUNCH_WINDOW_START_MINUTES = 11 * 60 + 30;
const LUNCH_WINDOW_END_MINUTES = 14 * 60 + 30;
const LUNCH_SELECTION_BUFFER_MINUTES = 60;
const CLOSING_BUFFER_MINUTES = 30; // NEW BUFFER
const DEFAULT_LUNCH_VISIT_DURATION_MINUTES = 90;
const MIN_LUNCH_VISIT_DURATION_MINUTES = 45;
const MAX_LUNCH_VISIT_DURATION_MINUTES = 120;
const ACCOMMODATION_WINDOW_START_MINUTES = 17 * 60;
const ACCOMMODATION_WINDOW_END_MINUTES = 22 * 60;
const ACCOMMODATION_SELECTION_BUFFER_MINUTES = 120;
const DEFAULT_ACCOMMODATION_VISIT_DURATION_MINUTES = 60;
const LUNCH_CATEGORY_KEYWORDS = [
  "resto",
  "restaurant",
  "makan",
  "kuliner",
  "cafe",
  "food",
  "bakery",
  "diner",
  "warung",
];
const ACCOMMODATION_CATEGORY_KEYWORDS = [
  "hotel",
  "akomodasi",
  "penginapan",
  "villa",
  "homestay",
  "guest",
  "resort",
  "lodge",
  "inn",
  "cottage",
  "bed",
];

const CATEGORY_VISIT_DURATION_RULES = {
  waterfall: {
    minMinutes: 240,
    maxMinutes: 360,
    defaultMinutes: 300,
    label: "air terjun",
  },
  mountain: {
    minMinutes: 300,
    maxMinutes: 420,
    defaultMinutes: 360,
    label: "gunung",
  },
  default: {
    minMinutes: 150, // 2.5 jam
    maxMinutes: 240, // 4 jam
    defaultMinutes: 210, // 3.5 jam
    label: "umum",
  },
};

const {
  getAllWisata,
  getAllTempatMakan,
  getAllAkomodasi,
  getAvailableWisataCategories,
} = buildWisataDataAccess({ supabase, normalizeCategoryTokens });

const {
  mapDestination,
  mapLunchCandidatesFromTempatMakan,
  mapAccommodationCandidatesFromRows,
} = buildWisataMappers({
  normalizeCategoryTokens,
  normalizeOperatingHoursText,
  parseOperatingHours,
  roundUpToTimeSlot,
  resolveMinimumVisitDurationMinutes,
  lunchSourceType: tempatMakanTable,
  defaultLunchVisitDurationMinutes: DEFAULT_LUNCH_VISIT_DURATION_MINUTES,
  minLunchVisitDurationMinutes: MIN_LUNCH_VISIT_DURATION_MINUTES,
  maxLunchVisitDurationMinutes: MAX_LUNCH_VISIT_DURATION_MINUTES,
  defaultAccommodationVisitDurationMinutes:
    DEFAULT_ACCOMMODATION_VISIT_DURATION_MINUTES,
});

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateToClockText(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  return formatMinutesToClock(date.getUTCHours() * 60 + date.getUTCMinutes());
}

function normalizeTextListTokens(value) {
  if (!value) return [];
  return String(value)
    .toLowerCase()
    .split(/[,/|;]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function buildSimpleItineraryView(itineraryByDay) {
  return itineraryByDay.map((dayPlan) => ({
    date: dayPlan.date,
    visits: dayPlan.visits.map((visit) => {
      // UX TWEAK: Hitung jam berangkat (Jam Tiba dikurangi waktu tempuh)
      const arrivalTime = new Date(visit.schedule.arrivalTime);
      const departureTime = new Date(
        arrivalTime.getTime() - visit.travel.estimatedTravelSlotMinutes * 60000,
      );

      const departureText = formatDateToClockText(departureTime);
      const visitEndText = visit.isAccommodationStop
        ? ""
        : ` - ${formatDateToClockText(visit.schedule.visitEndTime)}`;

      return {
        time: `${departureText}${visitEndText}`, // Output: "08:00 - 13:15"
        name: visit.destinationName,
        distanceKm: visit.travel.distanceKm,
        estimatedTravelMinutes: visit.travel.estimatedTravelMinutes,
        estimatedTravelText:
          visit.estimatedTravelText ||
          `${visit.travel.estimatedTravelMinutes} menit`,
        estimatedTravelSlotMinutes: visit.travel.estimatedTravelSlotMinutes,
        category: visit.category,
        categories: visit.categories || [],
        facilities: visit.facilities || [],
        isLunchStop: Boolean(visit.isLunchStop),
        isAccommodationStop: Boolean(visit.isAccommodationStop),
        alternatives: visit.alternatives || [],
      };
    }),
  }));
}

function getFirstAvailableValue(source, keys) {
  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(source, key) &&
      source[key] !== null &&
      source[key] !== undefined
    ) {
      return source[key];
    }
  }
  return null;
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "ya", "yes", "open", "buka"].includes(normalized))
    return true;
  if (["false", "0", "tidak", "no", "closed", "tutup"].includes(normalized))
    return false;
  return null;
}

function distanceToTravelMinutesSafe(distanceKm, speedKmh) {
  const safeSpeed = speedKmh > 0 ? speedKmh : DEFAULT_TRAVEL_SPEED_KMH;
  return distanceToTravelMinutes(distanceKm, safeSpeed);
}

function buildDateByMinutes(baseDate, minutesFromMidnight) {
  const date = new Date(baseDate);
  date.setUTCHours(
    Math.floor(minutesFromMidnight / 60),
    minutesFromMidnight % 60,
    0,
    0,
  );
  return date;
}

function estimateTravelMinutes(distanceKm, speedKmh) {
  const rawMinutes = distanceToTravelMinutesSafe(distanceKm, speedKmh);
  return {
    rawMinutes,
    slotMinutes: roundUpToTimeSlot(rawMinutes),
  };
}

function resolveTravelDurationBonusMinutes(travelMinutesRaw) {
  if (!Number.isFinite(travelMinutesRaw) || travelMinutesRaw <= 0) return 0;
  if (travelMinutesRaw >= 45) return 45;
  if (travelMinutesRaw >= 30) return 30;
  if (travelMinutesRaw >= 20) return 15;
  return 0;
}

// ANTI TIME TRAVEL & OSRM GUARD APPLIED HERE
async function applyRoadMetricsToItinerary({
  itineraryByDay,
  userPoint,
  speed,
}) {
  let currentDayStartPoint = userPoint;

  for (const dayPlan of itineraryByDay) {
    if (!Array.isArray(dayPlan.visits) || dayPlan.visits.length === 0) continue;

    const points = [
      currentDayStartPoint,
      ...dayPlan.visits.map((visit) => ({
        latitude: visit.location.latitude,
        longitude: visit.location.longitude,
      })),
    ];

    let matrixData = null;
    try {
      matrixData = await getMatrixDistancesFromOsrm(points);
    } catch (error) {
      matrixData = null;
    }

    const distances = matrixData?.distances || null;
    const durations = matrixData?.durations || null;

    let currentTime = new Date(dayPlan.activeWindow.start);
    let currentPoint = currentDayStartPoint;

    for (let index = 0; index < dayPlan.visits.length; index += 1) {
      const visit = dayPlan.visits[index];
      const rowIndex = index;
      const colIndex = index + 1;
      const rawDistanceMeters = distances?.[rowIndex]?.[colIndex];
      const hasRoadDistance =
        Number.isFinite(rawDistanceMeters) && rawDistanceMeters >= 0;

      const havDistanceKm = haversineDistanceKm(currentPoint, visit.location);
      let roadDistanceKm = havDistanceKm;
      let effectiveDurationMinutes = distanceToTravelMinutesSafe(
        havDistanceKm,
        speed,
      );
      let distanceSource = "straight-haversine-fallback";
      let osrmDurationMinutes = null;

      if (hasRoadDistance) {
        const tempRoadDistanceKm = rawDistanceMeters / 1000;
        if (tempRoadDistanceKm <= Math.max(havDistanceKm * 3, 5)) {
          roadDistanceKm = tempRoadDistanceKm;
          const rawDurationSeconds = durations?.[rowIndex]?.[colIndex];
          osrmDurationMinutes =
            Number.isFinite(rawDurationSeconds) && rawDurationSeconds >= 0
              ? rawDurationSeconds / 60
              : null;
          const modeledDurationMinutes = distanceToTravelMinutesSafe(
            roadDistanceKm,
            speed,
          );
          effectiveDurationMinutes =
            osrmDurationMinutes === null
              ? modeledDurationMinutes
              : Math.max(osrmDurationMinutes, modeledDurationMinutes);
          distanceSource = "road-osrm";
        }
      }

      const slotMinutes = roundUpToTimeSlot(effectiveDurationMinutes);

      visit.travel.distanceKm = Number(roadDistanceKm.toFixed(2));
      visit.travel.distanceMeters = Math.round(roadDistanceKm * 1000);
      visit.travel.osrmDurationMinutes =
        osrmDurationMinutes === null
          ? null
          : Number(osrmDurationMinutes.toFixed(1));
      visit.travel.modeledDurationMinutes = Number(
        distanceToTravelMinutesSafe(roadDistanceKm, speed).toFixed(1),
      );
      visit.travel.estimatedTravelMinutes = Number(
        effectiveDurationMinutes.toFixed(1),
      );
      visit.travel.estimatedTravelSlotMinutes = slotMinutes;
      visit.travel.distanceSource = distanceSource;

      visit.estimatedTravelMinutes = Number(
        effectiveDurationMinutes.toFixed(1),
      );
      visit.estimatedTravelText = `${effectiveDurationMinutes.toFixed(1)} menit`;
      visit.estimatedTravelSlotMinutes = slotMinutes;

      const arrivalTime = addMinutesToDate(currentTime, slotMinutes);
      const parsedOperatingHours = parseOperatingHours(
        visit.operatingHours?.text || visit.schedule?.operatingHours || null,
      );
      const dayStart = new Date(dayPlan.activeWindow.start);
      const operatingWindow = parsedOperatingHours
        ? buildOperatingWindowForDate(parsedOperatingHours, dayStart)
        : null;

      let visitStart = operatingWindow
        ? new Date(
            Math.max(arrivalTime.getTime(), operatingWindow.start.getTime()),
          )
        : arrivalTime;

      // LUNCH ENFORCER (Relaxed)
      if (visit.isLunchStop) {
        const lunchTarget = buildDateByMinutes(
          dayStart,
          LUNCH_WINDOW_START_MINUTES,
        );

        if (
          visitStart < lunchTarget &&
          (!operatingWindow || visitStart < operatingWindow.start)
        ) {
          visitStart = lunchTarget;
        }
      }

      const visitStartAligned = alignDateToTimeSlot(visitStart);
      const waitingMinutes = Math.max(
        0,
        dateDiffMinutes(visitStartAligned, arrivalTime),
      );

      // --- PATCH BUG 1: POTONG DURASI JIKA MELEWATI BATAS TUTUP ---
      const dayEnd = new Date(dayPlan.activeWindow.end);
      const visitEndLimit = operatingWindow
        ? new Date(
            Math.min(
              dayEnd.getTime(),
              operatingWindow.end.getTime() - CLOSING_BUFFER_MINUTES * 60000,
            ),
          )
        : dayEnd;
      const visitEndLimitAligned = alignDateToTimeSlot(visitEndLimit, "down");

      const maxAllowedVisitMinutes = Math.max(
        0,
        roundDownToTimeSlot(
          dateDiffMinutes(visitEndLimitAligned, visitStartAligned),
        ),
      );
      const visitDurationMinutes = Math.min(
        visit.estimatedVisitDurationMinutes || 0,
        maxAllowedVisitMinutes,
      );

      let visitEndTime = addMinutesToDate(
        visitStartAligned,
        visitDurationMinutes,
      );
      // -------------------------------------------------------------

      if (visit.checkInOnly) {
        visitEndTime = visitStartAligned;
        visit.schedule.visitEndTime = null;
      } else {
        visit.schedule.visitEndTime = visitEndTime.toISOString();
      }

      visit.schedule.arrivalTime = arrivalTime.toISOString();
      visit.schedule.visitStartTime = visitStartAligned.toISOString();
      visit.schedule.waitingMinutes = Math.ceil(waitingMinutes);
      visit.totalConsumedMinutes = Math.ceil(
        slotMinutes + waitingMinutes + visitDurationMinutes,
      );

      currentTime = visitEndTime;
      currentPoint = {
        latitude: visit.location.latitude,
        longitude: visit.location.longitude,
      };
    }

    dayPlan.usedMinutes = Math.max(
      0,
      Math.ceil(
        dateDiffMinutes(currentTime, new Date(dayPlan.activeWindow.start)),
      ),
    );
    dayPlan.remainingMinutes = Math.max(
      0,
      Math.floor(
        dateDiffMinutes(new Date(dayPlan.activeWindow.end), currentTime),
      ),
    );

    if (dayPlan.visits.length > 0) {
      const lastVisit = dayPlan.visits[dayPlan.visits.length - 1];
      currentDayStartPoint = {
        latitude: lastVisit.location.latitude,
        longitude: lastVisit.location.longitude,
      };
    }
  }
}

function detectCategoryVisitRule(categoryValue) {
  const tokens = normalizeCategoryTokens(categoryValue);
  const joined = tokens.join(" ");
  if (joined.includes("air terjun") || joined.includes("waterfall"))
    return CATEGORY_VISIT_DURATION_RULES.waterfall;
  if (joined.includes("gunung") || joined.includes("mountain"))
    return CATEGORY_VISIT_DURATION_RULES.mountain;
  return CATEGORY_VISIT_DURATION_RULES.default;
}

function resolveVisitDurationMinutes(destination, mode, destinationLimit) {
  const rule = detectCategoryVisitRule(destination.category);
  const rawDuration = destination.visitDurationMinutes;
  
  const isUnlimited = destinationLimit === null || destinationLimit === undefined;
  const targetKategoriDuration = isUnlimited ? rule.minMinutes : rule.defaultMinutes;

  if (mode === "kategori")
    return { minutes: targetKategoriDuration, source: `rule-${rule.label}` };

  if (mode === "data") {
    return {
      minutes: rawDuration || targetKategoriDuration,
      source: rawDuration ? "data-csv" : `fallback-rule-${rule.label}`,
    };
  }

  if (!rawDuration)
    return {
      minutes: targetKategoriDuration,
      source: `fallback-rule-${rule.label}`,
    };
  const clamped = Math.min(
    rule.maxMinutes,
    Math.max(rule.minMinutes, rawDuration),
  );
  return {
    minutes: clamped,
    source:
      clamped === rawDuration ? "data-csv" : `hybrid-clamped-${rule.label}`,
  };
}

function countFeasibleNextDestinationsAfterVisit({
  orderedCandidates,
  selectedDestinationIds,
  currentCandidateId,
  currentPoint,
  currentTime,
  dayStart,
  dayEnd,
  speed,
}) {
  let feasibleCount = 0;
  for (const nextCandidate of orderedCandidates) {
    if (selectedDestinationIds.has(nextCandidate.id)) continue;
    if (
      nextCandidate.id === currentCandidateId ||
      nextCandidate.isOpen === false
    )
      continue;

    const nextTravelDistanceKm = haversineDistanceKm(
      currentPoint,
      nextCandidate,
    );
    const nextTravelMinutes = roundUpToTimeSlot(
      distanceToTravelMinutesSafe(nextTravelDistanceKm, speed),
    );
    const nextArrivalTime = alignDateToTimeSlot(
      addMinutesToDate(currentTime, nextTravelMinutes),
    );
    if (nextArrivalTime >= dayEnd) continue;

    const nextOperatingWindow = buildOperatingWindowForDate(
      nextCandidate.operatingHours,
      dayStart,
    );
    const nextVisitStart = nextOperatingWindow
      ? new Date(
          Math.max(
            nextArrivalTime.getTime(),
            nextOperatingWindow.start.getTime(),
          ),
        )
      : nextArrivalTime;
    const nextVisitStartAligned = alignDateToTimeSlot(nextVisitStart);

    // CLOSING BUFFER
    const nextVisitEndLimit = nextOperatingWindow
      ? new Date(
          Math.min(
            dayEnd.getTime(),
            nextOperatingWindow.end.getTime() - CLOSING_BUFFER_MINUTES * 60000,
          ),
        )
      : dayEnd;
    const nextVisitEndLimitAligned = alignDateToTimeSlot(
      nextVisitEndLimit,
      "down",
    );

    if (nextVisitStartAligned >= nextVisitEndLimitAligned) continue;
    const nextFinishTime = addMinutesToDate(
      nextVisitStartAligned,
      nextCandidate.minVisitDurationMinutes,
    );
    if (nextFinishTime <= nextVisitEndLimitAligned) feasibleCount += 1;
  }
  return feasibleCount;
}

function estimateReserveForNextStopMinutes({
  orderedCandidates,
  selectedDestinationIds,
  currentCandidateId,
  currentPoint,
  speed,
}) {
  let bestReserve = null;
  for (const nextCandidate of orderedCandidates) {
    if (selectedDestinationIds.has(nextCandidate.id)) continue;
    if (
      nextCandidate.id === currentCandidateId ||
      nextCandidate.isOpen === false
    )
      continue;
    const nextTravelDistanceKm = haversineDistanceKm(
      currentPoint,
      nextCandidate,
    );
    const nextTravelMinutes = roundUpToTimeSlot(
      distanceToTravelMinutesSafe(nextTravelDistanceKm, speed),
    );
    const reserve = nextTravelMinutes + nextCandidate.minVisitDurationMinutes;
    if (bestReserve === null || reserve < bestReserve) bestReserve = reserve;
  }
  return bestReserve;
}

function selectNearestFeasibleCandidateFromPool({
  poolCandidates,
  currentPoint,
  currentTime,
  dayStart,
  dayEnd,
  speed,
}) {
  let bestCandidate = null;
  for (const candidate of poolCandidates) {
    const travelDistanceKm = haversineDistanceKm(currentPoint, candidate);
    const travelEstimate = estimateTravelMinutes(travelDistanceKm, speed);
    const travelMinutes = travelEstimate.slotMinutes;
    const arrivalTime = alignDateToTimeSlot(
      addMinutesToDate(currentTime, travelMinutes),
    );

    if (arrivalTime >= dayEnd) continue;

    const operatingWindow = buildOperatingWindowForDate(
      candidate.operatingHours,
      dayStart,
    );
    const effectiveVisitStart = operatingWindow
      ? new Date(
          Math.max(arrivalTime.getTime(), operatingWindow.start.getTime()),
        )
      : arrivalTime;
    const effectiveVisitStartAligned = alignDateToTimeSlot(effectiveVisitStart);

    // CLOSING BUFFER
    const effectiveVisitEndLimit = operatingWindow
      ? new Date(
          Math.min(
            dayEnd.getTime(),
            operatingWindow.end.getTime() - CLOSING_BUFFER_MINUTES * 60000,
          ),
        )
      : dayEnd;
    const effectiveVisitEndLimitAligned = alignDateToTimeSlot(
      effectiveVisitEndLimit,
      "down",
    );

    if (effectiveVisitStartAligned >= effectiveVisitEndLimitAligned) continue;

    const availableVisitMinutes = roundDownToTimeSlot(
      dateDiffMinutes(
        effectiveVisitEndLimitAligned,
        effectiveVisitStartAligned,
      ),
    );
    if (availableVisitMinutes < candidate.minVisitDurationMinutes) continue;

    const travelDurationBonusMinutes = resolveTravelDurationBonusMinutes(
      travelEstimate.rawMinutes,
    );
    const visitDurationMinutes = Math.min(
      candidate.finalVisitDurationMinutes + travelDurationBonusMinutes,
      availableVisitMinutes,
    );
    const finishTime = addMinutesToDate(
      effectiveVisitStartAligned,
      visitDurationMinutes,
    );

    if (finishTime > effectiveVisitEndLimitAligned) continue;

    const waitMinutes = roundUpToTimeSlot(
      Math.max(0, dateDiffMinutes(effectiveVisitStartAligned, arrivalTime)),
    );

    const evaluated = {
      candidate,
      travelDistanceKm,
      travelMinutesRaw: travelEstimate.rawMinutes,
      travelMinutes,
      waitMinutes,
      arrivalTime,
      visitStart: effectiveVisitStartAligned,
      finishTime,
      totalConsumedMinutes: travelMinutes + waitMinutes + visitDurationMinutes,
      closingSlackMinutes: Math.max(
        0,
        Math.floor(dateDiffMinutes(effectiveVisitEndLimitAligned, finishTime)),
      ),
      almostClosing: false,
      operatingWindow,
      effectiveVisitEndLimit: effectiveVisitEndLimitAligned,
      visitDurationMinutes,
      travelDurationBonusMinutes,
    };

    // (Pendekatan Fungsi Objektif Waktu)
    const wastedTimeMinutes = evaluated.travelMinutes + evaluated.waitMinutes;
    const bestWastedTimeMinutes = bestCandidate
      ? bestCandidate.travelMinutes + bestCandidate.waitMinutes
      : Infinity;

    if (
      !bestCandidate ||
      wastedTimeMinutes < bestWastedTimeMinutes ||
      // Jika waktu terbuangnya sama persis, gunakan jarak sebagai penentu
      (wastedTimeMinutes === bestWastedTimeMinutes &&
        evaluated.travelDistanceKm < bestCandidate.travelDistanceKm)
    ) {
      bestCandidate = evaluated;
    }
  }
  return bestCandidate;
}

function isCandidateBetter(currentBest, nextCandidate) {
  if (!currentBest) return true;

  // Hitung total waktu terbuang (Perjalanan + Menunggu Gerbang Buka)
  const currentWastedTime = currentBest.travelMinutes + currentBest.waitMinutes;
  const nextWastedTime =
    nextCandidate.travelMinutes + nextCandidate.waitMinutes;

  // Prioritas 1: Minimalkan Waktu Terbuang
  if (currentWastedTime !== nextWastedTime) {
    return nextWastedTime < currentWastedTime;
  }

  // Prioritas 2: Jika waktu terbuang sama, ambil yang jarak meternya terdekat
  if (currentBest.travelDistanceKm !== nextCandidate.travelDistanceKm) {
    return nextCandidate.travelDistanceKm < currentBest.travelDistanceKm;
  }

  // Prioritas 3 dan seterusnya (Tie-breakers bawaan Anda)
  if (currentBest.feasibleNextCount !== nextCandidate.feasibleNextCount)
    return nextCandidate.feasibleNextCount > currentBest.feasibleNextCount;
  if (currentBest.almostClosing !== nextCandidate.almostClosing)
    return nextCandidate.almostClosing;
  if (currentBest.closingSlackMinutes !== nextCandidate.closingSlackMinutes)
    return nextCandidate.closingSlackMinutes < currentBest.closingSlackMinutes;
  if (currentBest.totalConsumedMinutes !== nextCandidate.totalConsumedMinutes)
    return (
      nextCandidate.totalConsumedMinutes < currentBest.totalConsumedMinutes
    );

  return (
    nextCandidate.candidate.distanceFromUserKm <
    currentBest.candidate.distanceFromUserKm
  );
}

function buildGreedyCandidatePool({
  orderedCandidates,
  selectedDestinationIds,
  currentPoint,
  destinationLimit,
}) {
  const rawPoolSize = destinationLimit
    ? Math.max(
        GREEDY_NEAREST_PREFILTER_SIZE,
        destinationLimit * GREEDY_NEAREST_POOL_MULTIPLIER,
      )
    : GREEDY_NEAREST_POOL_MIN;
  const poolSize = Math.min(
    orderedCandidates.length,
    Math.max(GREEDY_NEAREST_PREFILTER_SIZE, rawPoolSize),
  );
  const ranked = [];

  for (const candidate of orderedCandidates) {
    if (selectedDestinationIds.has(candidate.id) || candidate.isOpen === false)
      continue;
    ranked.push({
      candidate,
      distanceFromCurrentKm: haversineDistanceKm(currentPoint, candidate),
    });
  }
  ranked.sort((a, b) => a.distanceFromCurrentKm - b.distanceFromCurrentKm);
  return ranked.slice(0, poolSize).map((item) => item.candidate);
}

function evaluateBestCandidateFromPool({
  poolCandidates,
  orderedCandidates,
  selectedDestinationIds,
  currentPoint,
  currentTime,
  dayStart,
  dayEnd,
  speed,
  destinationLimit,
  chosenStopsCount,
}) {
  let bestCandidate = null;

  for (const candidate of poolCandidates) {
    const travelDistanceKm = haversineDistanceKm(currentPoint, candidate);
    const travelEstimate = estimateTravelMinutes(travelDistanceKm, speed);
    const travelMinutes = travelEstimate.slotMinutes;
    const arrivalTime = alignDateToTimeSlot(
      addMinutesToDate(currentTime, travelMinutes),
    );

    if (arrivalTime >= dayEnd) continue;

    const operatingWindow = buildOperatingWindowForDate(
      candidate.operatingHours,
      dayStart,
    );
    const effectiveVisitStart = operatingWindow
      ? new Date(
          Math.max(arrivalTime.getTime(), operatingWindow.start.getTime()),
        )
      : arrivalTime;
    const effectiveVisitStartAligned = alignDateToTimeSlot(effectiveVisitStart);

    // CLOSING BUFFER
    const effectiveVisitEndLimit = operatingWindow
      ? new Date(
          Math.min(
            dayEnd.getTime(),
            operatingWindow.end.getTime() - CLOSING_BUFFER_MINUTES * 60000,
          ),
        )
      : dayEnd;
    const effectiveVisitEndLimitAligned = alignDateToTimeSlot(
      effectiveVisitEndLimit,
      "down",
    );

    if (effectiveVisitStartAligned >= effectiveVisitEndLimitAligned) continue;

    const availableVisitMinutes = roundDownToTimeSlot(
      dateDiffMinutes(
        effectiveVisitEndLimitAligned,
        effectiveVisitStartAligned,
      ),
    );
    if (availableVisitMinutes < candidate.minVisitDurationMinutes) continue;

    const travelDurationBonusMinutes = resolveTravelDurationBonusMinutes(
      travelEstimate.rawMinutes,
    );
    let visitDurationMinutes = Math.min(
      candidate.finalVisitDurationMinutes + travelDurationBonusMinutes,
      availableVisitMinutes,
    );

    const needMoreStops =
      destinationLimit && chosenStopsCount + 1 < destinationLimit;
    if (needMoreStops) {
      const reserveForNextStopMinutes = estimateReserveForNextStopMinutes({
        orderedCandidates,
        selectedDestinationIds,
        currentCandidateId: candidate.id,
        currentPoint: {
          latitude: candidate.latitude,
          longitude: candidate.longitude,
        },
        speed,
      });
      if (reserveForNextStopMinutes !== null) {
        const maxVisitForReservation = roundDownToTimeSlot(
          availableVisitMinutes - reserveForNextStopMinutes,
        );
        if (maxVisitForReservation >= candidate.minVisitDurationMinutes) {
          visitDurationMinutes = Math.min(
            visitDurationMinutes,
            maxVisitForReservation,
          );
        }
      }
    }

    const finishTime = addMinutesToDate(
      effectiveVisitStartAligned,
      visitDurationMinutes,
    );
    if (finishTime > effectiveVisitEndLimitAligned) continue;

    const waitMinutes = roundUpToTimeSlot(
      Math.max(0, dateDiffMinutes(effectiveVisitStartAligned, arrivalTime)),
    );
    const totalConsumedMinutes =
      travelMinutes + waitMinutes + visitDurationMinutes;
    const closingSlackMinutes = Math.max(
      0,
      Math.floor(dateDiffMinutes(effectiveVisitEndLimitAligned, finishTime)),
    );
    const minutesUntilCloseFromArrival = Math.floor(
      dateDiffMinutes(effectiveVisitEndLimitAligned, arrivalTime),
    );
    const almostClosing =
      minutesUntilCloseFromArrival <= PRIORITIZE_CLOSING_THRESHOLD_MINUTES;

    const evaluated = {
      candidate,
      travelDistanceKm,
      travelMinutesRaw: travelEstimate.rawMinutes,
      travelMinutes,
      waitMinutes,
      arrivalTime,
      visitStart: effectiveVisitStartAligned,
      finishTime,
      totalConsumedMinutes,
      closingSlackMinutes,
      almostClosing,
      operatingWindow,
      effectiveVisitEndLimit: effectiveVisitEndLimitAligned,
      visitDurationMinutes,
      travelDurationBonusMinutes,
      feasibleNextCount: countFeasibleNextDestinationsAfterVisit({
        orderedCandidates,
        selectedDestinationIds,
        currentCandidateId: candidate.id,
        currentPoint: {
          latitude: candidate.latitude,
          longitude: candidate.longitude,
        },
        currentTime: finishTime,
        dayStart,
        dayEnd,
        speed,
      }),
    };

    if (isCandidateBetter(bestCandidate, evaluated)) bestCandidate = evaluated;
  }
  return bestCandidate;
}

function buildLunchCandidatePool({
  candidatePool,
  lunchCandidates,
  selectedDestinationIds,
  currentPoint,
}) {
  const merged = [];
  const seenIds = new Set();
  const lunchVisitDurationMinutes = roundUpToTimeSlot(
    DEFAULT_LUNCH_VISIT_DURATION_MINUTES,
  );

  for (const item of [...candidatePool, ...lunchCandidates]) {
    if (!item || selectedDestinationIds.has(item.id) || item.isOpen === false)
      continue;
    if (seenIds.has(item.id)) continue;
    if (!isLunchFriendlyDestination(item)) continue;

    seenIds.add(item.id);
    merged.push({
      ...item,
      finalVisitDurationMinutes: lunchVisitDurationMinutes,
      minVisitDurationMinutes: lunchVisitDurationMinutes,
      visitDurationSource:
        item.sourceType === tempatMakanTable
          ? "default-tempat_makan"
          : "forced-lunch-90-minutes",
    });
  }

  return merged
    .map((item) => ({
      ...item,
      distanceFromCurrentKm: haversineDistanceKm(currentPoint, item),
    }))
    .sort((a, b) => a.distanceFromCurrentKm - b.distanceFromCurrentKm);
}

function buildAccommodationCandidatePool({
  candidatePool,
  accommodationCandidates,
  selectedDestinationIds,
  currentPoint,
}) {
  const merged = [];
  const seenIds = new Set();

  for (const item of [...candidatePool, ...accommodationCandidates]) {
    if (!item || selectedDestinationIds.has(item.id) || item.isOpen === false)
      continue;
    if (seenIds.has(item.id)) continue;
    if (!isAccommodationFriendlyDestination(item)) continue;

    seenIds.add(item.id);
    merged.push(item);
  }

  return merged
    .map((item) => ({
      ...item,
      distanceFromCurrentKm: haversineDistanceKm(currentPoint, item),
    }))
    .sort((a, b) => a.distanceFromCurrentKm - b.distanceFromCurrentKm);
}

function buildTopFeatureRecommendations(poolCandidates, limit = 3) {
  return poolCandidates.slice(0, limit).map((candidate, index) => ({
    rank: index + 1,
    destinationId: candidate.id,
    destinationName: candidate.name,
    category: candidate.category,
    categories: candidate.categoryTokens || candidate.categories || [],
    rating: candidate.rating ?? null,
    phoneNumber: candidate.phoneNumber || null,
    sourceType: candidate.sourceType || wisataTable,
    location: { latitude: candidate.latitude, longitude: candidate.longitude },
    distanceKm: Number((candidate.distanceFromCurrentKm || 0).toFixed(2)),
    operatingHours:
      candidate.operatingHoursText || candidate.operatingHours?.text || null,
    imageUrl: candidate.imageUrl || null,
    ticketPrice: candidate.ticketPrice ?? null,
    price: candidate.price ?? candidate.ticketPrice ?? null,
    description: candidate.description || null,
    facilities: candidate.facilities || [],
  }));
}

function normalizePreference(preferences) {
  if (!preferences) return [];
  const inputArray = Array.isArray(preferences) ? preferences : [preferences];
  const expanded = inputArray.flatMap((item) =>
    String(item)
      .split(/[,/|;]/)
      .map((token) => token.trim().toLowerCase()),
  );
  return [...new Set(expanded.filter((item) => item.length > 0))];
}

function resolveUserPoint(input) {
  const coordinateObject = getFirstAvailableValue(input, [
    "koordinat",
    "coordinate",
  ]);
  const latitudeFromObject = coordinateObject
    ? parseNumber(getFirstAvailableValue(coordinateObject, ["latitude", "lat"]))
    : null;
  const longitudeFromObject = coordinateObject
    ? parseNumber(
        getFirstAvailableValue(coordinateObject, ["longitude", "lng", "lon"]),
      )
    : null;
  const latitude =
    latitudeFromObject ??
    parseNumber(
      getFirstAvailableValue(input, ["userLatitude", "latitude", "lat"]),
    );
  const longitude =
    longitudeFromObject ??
    parseNumber(
      getFirstAvailableValue(input, [
        "userLongitude",
        "longitude",
        "lng",
        "lon",
      ]),
    );
  if (latitude === null || longitude === null)
    throw new Error("koordinat wajib diisi (latitude dan longitude)");
  return { latitude, longitude };
}

function normalizeJenisWisata(input) {
  const jenis = getFirstAvailableValue(input, ["jenisWisata", "preferences"]);
  const normalized = normalizePreference(jenis);
  const hasAllPreference = normalized.some((item) =>
    ["semua", "all", "any", "all categories", "semua kategori"].includes(item),
  );
  if (hasAllPreference) return [];
  return normalized;
}

function resolveLunchStopPreference(input) {
  const rawValue = getFirstAvailableValue(input, [
    "butuhMakanSiang",
    "needLunchStop",
    "includeLunchStop",
  ]);
  return parseBoolean(rawValue) === true;
}

function resolveAccommodationPreference(input) {
  const rawValue = getFirstAvailableValue(input, [
    "butuhAkomodasi",
    "needAccommodation",
    "includeAccommodation",
  ]);
  return parseBoolean(rawValue) === true;
}

function buildLunchWindow(dayStart, dayEnd) {
  const targetStart = buildDateByMinutes(dayStart, LUNCH_WINDOW_START_MINUTES);
  const targetEnd = buildDateByMinutes(dayStart, LUNCH_WINDOW_END_MINUTES);
  const start = new Date(Math.max(targetStart.getTime(), dayStart.getTime()));
  const end = new Date(Math.min(targetEnd.getTime(), dayEnd.getTime()));
  if (start >= end) return null;
  return { start, end };
}

function buildAccommodationWindow(dayStart, dayEnd) {
  const targetStart = buildDateByMinutes(
    dayStart,
    ACCOMMODATION_WINDOW_START_MINUTES,
  );
  const targetEnd = buildDateByMinutes(
    dayStart,
    ACCOMMODATION_WINDOW_END_MINUTES,
  );
  const start = new Date(Math.max(targetStart.getTime(), dayStart.getTime()));
  const end = new Date(Math.min(targetEnd.getTime(), dayEnd.getTime()));

  if (start >= end) {
    const fallbackEnd = new Date(dayEnd);
    const fallbackStart = addMinutesToDate(
      fallbackEnd,
      -DEFAULT_ACCOMMODATION_VISIT_DURATION_MINUTES,
    );
    if (fallbackStart >= fallbackEnd) return null;
    return { start: fallbackStart, end: fallbackEnd, isFallback: true };
  }
  return { start, end };
}

function shouldAttemptLunchSelection(currentTime, lunchWindow) {
  if (!lunchWindow) return false;
  const selectionStart = addMinutesToDate(
    lunchWindow.start,
    -LUNCH_SELECTION_BUFFER_MINUTES,
  );
  return currentTime >= selectionStart && currentTime < lunchWindow.end;
}

function shouldAttemptAccommodationSelection(currentTime, accommodationWindow) {
  if (!accommodationWindow) return false;
  const selectionStart = addMinutesToDate(
    accommodationWindow.start,
    -ACCOMMODATION_SELECTION_BUFFER_MINUTES,
  );
  return currentTime >= selectionStart && currentTime < accommodationWindow.end;
}

function isLunchFriendlyDestination(destination) {
  const tokens = [
    ...normalizeTextListTokens(destination.name),
    ...normalizeTextListTokens(destination.category),
    ...(destination.categoryTokens || []),
  ];
  return LUNCH_CATEGORY_KEYWORDS.some((keyword) =>
    tokens.some((token) => token.includes(keyword)),
  );
}

function isAccommodationFriendlyDestination(destination) {
  const tokens = [
    ...normalizeTextListTokens(destination.name),
    ...normalizeTextListTokens(destination.category),
    ...(destination.categoryTokens || []),
    ...(destination.facilities || []),
  ];
  return ACCOMMODATION_CATEGORY_KEYWORDS.some((keyword) =>
    tokens.some((token) => token.includes(keyword)),
  );
}

function doesVisitOverlapLunchWindow(visitStart, visitEnd, lunchWindow) {
  if (!lunchWindow) return false;
  return visitStart < lunchWindow.end && visitEnd > lunchWindow.start;
}

function doesVisitOverlapAccommodationWindow(
  visitStart,
  visitEnd,
  accommodationWindow,
) {
  if (!accommodationWindow) return false;
  return (
    visitStart < accommodationWindow.end && visitEnd > accommodationWindow.start
  );
}

function resolveDestinationLimit(input) {
  const limitValue = parseNumber(
    getFirstAvailableValue(input, ["jumlahTempatWisata", "maxDestinations"]),
  );
  if (limitValue === null) return null;
  if (limitValue < 1) throw new Error("jumlahTempatWisata harus minimal 1");
  return Math.floor(limitValue);
}

function validateInputs(input) {
  const userPoint = resolveUserPoint(input);
  const jumlahHariWisata =
    getFirstAvailableValue(input, ["jumlahHariWisata", "travelDays"]) ||
    DEFAULT_TRAVEL_DAYS;
  const jamMulai =
    getFirstAvailableValue(input, [
      "jamMulai",
      "startHour",
      "startTime",
      "waktuMulai",
      "jamAwal",
    ]) || "08:00";
  const jamBerakhir =
    getFirstAvailableValue(input, [
      "jamBerakhir",
      "endHour",
      "endTime",
      "waktuBerakhir",
      "jamSelesai",
      "jamAkhir",
    ]) || "18:00";

  // SUPPORT KALENDER: Mengambil tanggal dari input form
  const startDateStr = getFirstAvailableValue(input, [
    "tanggalMulai",
    "startDate",
    "tanggal",
  ]);

  return {
    userPoint,
    dailyWindows: buildDailyActiveWindowsFromForm(
      jumlahHariWisata,
      jamMulai,
      jamBerakhir,
      startDateStr,
    ),
    activeHoursRule: `${jamMulai}-${jamBerakhir}`,
  };
}

async function buildItineraryRecommendation(payload) {
  const { averageSpeedKmh } = payload;
  const { userPoint, dailyWindows, activeHoursRule } = validateInputs(payload);
  const normalizedPreference = normalizeJenisWisata(payload);
  const destinationLimit = resolveDestinationLimit(payload);
  const visitDurationMode = resolveVisitDurationMode(
    payload,
    getFirstAvailableValue,
  );
  const lunchStopRequested = resolveLunchStopPreference(payload);
  const accommodationRequested = resolveAccommodationPreference(payload);

  if (dailyWindows.length === 0) {
    return {
      itineraryByDay: [],
      recommendedDestinations: [],
      route: { startLocation: userPoint, orderedStops: [] },
      summary: {
        activeTourismMinutes: 0,
        usedMinutes: 0,
        remainingMinutes: 0,
        skippedReason: `Tidak ada waktu aktif wisata (${activeHoursRule})`,
      },
    };
  }

  const wisataData = await getAllWisata();
  const mappedDestinations = wisataData
    .map(mapDestination)
    .filter((item) => item.latitude !== null && item.longitude !== null);
  const mappedWithVisitPolicy = mappedDestinations
    .map((item) => {
      const durationPolicy = resolveVisitDurationMinutes(
        item,
        visitDurationMode,
        destinationLimit,
      );
      return {
        ...item,
        finalVisitDurationMinutes: roundUpToTimeSlot(durationPolicy.minutes),
        minVisitDurationMinutes: resolveMinimumVisitDurationMinutes(
          durationPolicy.minutes,
        ),
        visitDurationSource: durationPolicy.source,
      };
    })
    .filter((item) => item.finalVisitDurationMinutes !== null);

  let lunchCandidates = [];
  let lunchCandidatesLoadError = null;

  if (lunchStopRequested) {
    try {
      const tempatMakanRows = await getAllTempatMakan();
      lunchCandidates = mapLunchCandidatesFromTempatMakan(tempatMakanRows);
    } catch (error) {
      lunchCandidatesLoadError = error;
      lunchCandidates = [];
    }
  }

  let accommodationCandidates = [];
  let accommodationCandidatesLoadError = null;

  if (accommodationRequested) {
    try {
      const accommodationData = await getAllAkomodasi();
      accommodationCandidates = mapAccommodationCandidatesFromRows(
        accommodationData.rows,
        accommodationData.sourceTable,
      );
    } catch (error) {
      accommodationCandidatesLoadError = error;
      accommodationCandidates = [];
    }
  }

  const filteredByCategory =
    normalizedPreference.length === 0
      ? mappedWithVisitPolicy
      : mappedWithVisitPolicy.filter((item) =>
          categoryMatchesPreference(item.categoryTokens, normalizedPreference),
        );

  const orderedCandidates = filteredByCategory
    .map((item) => ({
      ...item,
      distanceFromUserKm: haversineDistanceKm(userPoint, item),
    }))
    .sort((a, b) => a.distanceFromUserKm - b.distanceFromUserKm);

  const itineraryByDay = dailyWindows.map((window) => ({
    date: window.date,
    activeWindow: {
      start: window.start.toISOString(),
      end: window.end.toISOString(),
      availableMinutes: Math.floor(window.availableMinutes),
    },
    visits: [],
    usedMinutes: 0,
    remainingMinutes: Math.floor(window.availableMinutes),
  }));

  const chosenStops = [];
  const selectedDestinationIds = new Set();
  const speed = parseNumber(averageSpeedKmh) || DEFAULT_TRAVEL_SPEED_KMH;
  let totalTourismStopsSelected = 0;
  let accommodationScheduledForTrip = false;
  const accommodationTargetDayIndex = accommodationRequested ? 0 : null;
  let lastDayEndPoint = userPoint;

  for (let dayIndex = 0; dayIndex < itineraryByDay.length; dayIndex += 1) {
    const dayPlan = itineraryByDay[dayIndex];
    const dayStart = new Date(dayPlan.activeWindow.start);
    const dayEnd = new Date(dayPlan.activeWindow.end);
    const lunchWindow = lunchStopRequested
      ? buildLunchWindow(dayStart, dayEnd)
      : null;
    let currentPoint = dayIndex === 0 ? userPoint : lastDayEndPoint;
    let currentTime = new Date(dayStart);
    let lunchStopAdded = false;
    let lunchStopVisitName = null;
    let lunchRecommendations = [];
    let accommodationAdded = false;
    let accommodationVisitName = null;
    let accommodationRecommendations = [];

    let dailyTourismLimit = null;
    if (destinationLimit) {
      const remainingDays = itineraryByDay.length - dayIndex;
      const remainingQuota = destinationLimit - totalTourismStopsSelected;
      // Math.ceil memastikan pembagian kuota tidak menghasilkan angka nol jika kuota ganjil
      dailyTourismLimit = Math.ceil(remainingQuota / remainingDays);
    }
    let dailyTourismStopsSelected = 0;

    while (currentTime < dayEnd) {
      const globalLimitReached =
        destinationLimit && totalTourismStopsSelected >= destinationLimit;
      const dailyLimitReached =
        dailyTourismLimit !== null &&
        dailyTourismStopsSelected >= dailyTourismLimit;
      const tourismLimitReached = globalLimitReached || dailyLimitReached;
      const lunchAttemptWindowOpen =
        lunchStopRequested &&
        !lunchStopAdded &&
        shouldAttemptLunchSelection(currentTime, lunchWindow);

      if (tourismLimitReached && !lunchAttemptWindowOpen) {
        if (
          lunchStopRequested &&
          !lunchStopAdded &&
          lunchWindow &&
          currentTime < lunchWindow.end
        ) {
          currentTime = new Date(
            Math.max(currentTime.getTime(), lunchWindow.start.getTime()),
          );
          continue;
        }
        break;
      }

      const candidatePool = buildGreedyCandidatePool({
        orderedCandidates,
        selectedDestinationIds,
        currentPoint,
        destinationLimit,
      });
      const pickCandidateFromPool = (poolCandidates) =>
        chosenStops.length === 0
          ? selectNearestFeasibleCandidateFromPool({
              poolCandidates,
              currentPoint,
              currentTime,
              dayStart,
              dayEnd,
              speed,
            })
          : evaluateBestCandidateFromPool({
              poolCandidates,
              orderedCandidates,
              selectedDestinationIds,
              currentPoint,
              currentTime,
              dayStart,
              dayEnd,
              speed,
              destinationLimit,
              chosenStopsCount: totalTourismStopsSelected,
            });

      let bestCandidate = null;

      if (tourismLimitReached) {
        if (lunchStopRequested && !lunchStopAdded) {
          const lunchPool = buildLunchCandidatePool({
            candidatePool,
            lunchCandidates,
            selectedDestinationIds,
            currentPoint,
          });
          lunchRecommendations = buildTopFeatureRecommendations(lunchPool, 4);
          bestCandidate = pickCandidateFromPool(lunchPool);
          if (!bestCandidate) {
            const lunchFallbackPool = buildLunchCandidatePool({
              candidatePool: orderedCandidates,
              lunchCandidates,
              selectedDestinationIds,
              currentPoint,
            });
            lunchRecommendations = buildTopFeatureRecommendations(
              lunchFallbackPool,
              4,
            );
            bestCandidate = pickCandidateFromPool(lunchFallbackPool);
          }
        }
      } else {
        if (
          lunchStopRequested &&
          !lunchStopAdded &&
          shouldAttemptLunchSelection(currentTime, lunchWindow)
        ) {
          const lunchPool = buildLunchCandidatePool({
            candidatePool,
            lunchCandidates,
            selectedDestinationIds,
            currentPoint,
          });
          lunchRecommendations = buildTopFeatureRecommendations(lunchPool, 4);
          bestCandidate = pickCandidateFromPool(lunchPool);
          if (!bestCandidate) {
            const lunchFallbackPool = buildLunchCandidatePool({
              candidatePool: orderedCandidates,
              lunchCandidates,
              selectedDestinationIds,
              currentPoint,
            });
            lunchRecommendations = buildTopFeatureRecommendations(
              lunchFallbackPool,
              4,
            );
            bestCandidate = pickCandidateFromPool(lunchFallbackPool);
          }
        }
        if (!bestCandidate)
          bestCandidate = pickCandidateFromPool(candidatePool);

        // FIX: Pastikan kandidat fallback sudah dibersihkan dari tempat yang pernah dikunjungi
        if (!bestCandidate) {
          const unvisitedCandidates = orderedCandidates.filter(
            (c) => !selectedDestinationIds.has(c.id),
          );
          if (candidatePool.length < unvisitedCandidates.length) {
            bestCandidate = pickCandidateFromPool(unvisitedCandidates);
          }
        }
      }

      if (!bestCandidate) break;

      const isLunchStop =
        lunchStopRequested &&
        !lunchStopAdded &&
        isLunchFriendlyDestination(bestCandidate.candidate) &&
        doesVisitOverlapLunchWindow(
          bestCandidate.visitStart,
          bestCandidate.finishTime,
          lunchWindow,
        );
      const isAccommodationStop = false;

      // FIX: Tambahkan waktu ekstra khusus untuk makan siang jika lokasi digabung
      // Hanya terapkan jika ini adalah wisata utama (minVisitDurationMinutes > 100). Restoran murni durasinya memang sudah 90 menit.
      if (isLunchStop && bestCandidate.candidate.minVisitDurationMinutes > 100) {
        const extraLunchMinutes = 60; // 1 Jam ekstra untuk makan siang
        bestCandidate.visitDurationMinutes += extraLunchMinutes;
        bestCandidate.finishTime = new Date(bestCandidate.finishTime.getTime() + extraLunchMinutes * 60000);
        bestCandidate.totalConsumedMinutes += extraLunchMinutes;
        
        // Pastikan tidak melewatinya jam operasional tutup (18:00)
        if (bestCandidate.finishTime > dayEnd) {
          const over = (bestCandidate.finishTime.getTime() - dayEnd.getTime()) / 60000;
          bestCandidate.visitDurationMinutes -= over;
          bestCandidate.totalConsumedMinutes -= over;
          bestCandidate.finishTime = new Date(dayEnd.getTime());
        }
      }

      if (tourismLimitReached && !isLunchStop && !isAccommodationStop) break;

      const visit = {
        order: chosenStops.length + 1,
        destinationId: bestCandidate.candidate.id,
        destinationName: bestCandidate.candidate.name,
        description: bestCandidate.candidate.description,
        ticketPrice: bestCandidate.candidate.ticketPrice,
        rating: bestCandidate.candidate.rating ?? null,
        phoneNumber: bestCandidate.candidate.phoneNumber || null,
        imageUrl: bestCandidate.candidate.imageUrl,
        locationLabel: bestCandidate.candidate.locationLabel,
        category: bestCandidate.candidate.category,
        categories: bestCandidate.candidate.categoryTokens,
        facilities: bestCandidate.candidate.facilities,
        operatingHours: {
          text: bestCandidate.candidate.operatingHoursText,
          startTime: bestCandidate.candidate.operatingHours
            ? formatMinutesToClock(
                bestCandidate.candidate.operatingHours.startMinutes,
              )
            : null,
          endTime: bestCandidate.candidate.operatingHours
            ? formatMinutesToClock(
                bestCandidate.candidate.operatingHours.endMinutes,
              )
            : null,
        },
        location: {
          latitude: bestCandidate.candidate.latitude,
          longitude: bestCandidate.candidate.longitude,
        },
        travel: {
          from: {
            latitude: currentPoint.latitude,
            longitude: currentPoint.longitude,
          },
          distanceKm: Number(bestCandidate.travelDistanceKm.toFixed(2)),
          estimatedTravelMinutes: Number(
            bestCandidate.travelMinutesRaw.toFixed(1),
          ),
          estimatedTravelSlotMinutes: Math.ceil(bestCandidate.travelMinutes),
        },
        estimatedTravelMinutes: Number(
          bestCandidate.travelMinutesRaw.toFixed(1),
        ),
        estimatedTravelText: `${bestCandidate.travelMinutesRaw.toFixed(1)} menit`,
        estimatedTravelSlotMinutes: Math.ceil(bestCandidate.travelMinutes),
        schedule: {
          arrivalTime: bestCandidate.arrivalTime.toISOString(),
          visitStartTime: bestCandidate.visitStart.toISOString(),
          visitEndTime: bestCandidate.finishTime.toISOString(),
          waitingMinutes: Math.ceil(bestCandidate.waitMinutes),
          operatingHours: bestCandidate.candidate.operatingHoursText,
        },
        estimatedVisitDurationMinutes: bestCandidate.visitDurationMinutes,
        travelDurationBonusMinutes: bestCandidate.travelDurationBonusMinutes,
        visitDurationSource: bestCandidate.candidate.visitDurationSource,
        sourceType: bestCandidate.candidate.sourceType || wisataTable,
        totalConsumedMinutes: Math.ceil(bestCandidate.totalConsumedMinutes),
        isLunchStop,
        isAccommodationStop,
        priorityReason: bestCandidate.almostClosing
          ? "Diprioritaskan karena hampir tutup"
          : "Dipilih karena kombinasi efisien jarak + waktu",
        alternatives: isLunchStop
          ? lunchRecommendations
              .filter((alt) => alt.destinationId !== bestCandidate.candidate.id)
              .slice(0, 3)
          : [],
      };

      dayPlan.visits.push(visit);
      chosenStops.push(visit);
      dayPlan.usedMinutes = Math.max(
        0,
        Math.ceil(dateDiffMinutes(bestCandidate.finishTime, dayStart)),
      );
      dayPlan.remainingMinutes = Math.max(
        0,
        Math.floor(dateDiffMinutes(dayEnd, bestCandidate.finishTime)),
      );

      currentPoint = {
        latitude: bestCandidate.candidate.latitude,
        longitude: bestCandidate.candidate.longitude,
      };
      currentTime = new Date(bestCandidate.finishTime);
      selectedDestinationIds.add(bestCandidate.candidate.id);

      if (isLunchStop) {
        lunchStopAdded = true;
        lunchStopVisitName = visit.destinationName;
        lunchRecommendations = visit.alternatives;
      } else {
        totalTourismStopsSelected += 1;
        dailyTourismStopsSelected += 1;
      }
    }

    const shouldScheduleAccommodationToday =
      accommodationRequested &&
      !accommodationScheduledForTrip &&
      dayIndex === accommodationTargetDayIndex;

    if (shouldScheduleAccommodationToday) {
      const accommodationPool = buildAccommodationCandidatePool({
        candidatePool: orderedCandidates,
        accommodationCandidates,
        selectedDestinationIds,
        currentPoint,
      });
      accommodationRecommendations = buildTopFeatureRecommendations(
        accommodationPool,
        4,
      );
      const selectedAccommodation = accommodationPool[0] || null;

      if (selectedAccommodation) {
        const checkInTime = new Date(dayEnd);
        const travelDistanceKm = haversineDistanceKm(
          currentPoint,
          selectedAccommodation,
        );
        const travelEstimate = estimateTravelMinutes(travelDistanceKm, speed);

        const accommodationVisit = {
          order: chosenStops.length + 1,
          destinationId: selectedAccommodation.id,
          destinationName: selectedAccommodation.name,
          description: selectedAccommodation.description,
          ticketPrice: selectedAccommodation.ticketPrice,
          rating: selectedAccommodation.rating ?? null,
          phoneNumber: selectedAccommodation.phoneNumber || null,
          imageUrl: selectedAccommodation.imageUrl,
          locationLabel: selectedAccommodation.locationLabel,
          category: selectedAccommodation.category,
          categories: selectedAccommodation.categoryTokens,
          facilities: selectedAccommodation.facilities,
          operatingHours: {
            text: selectedAccommodation.operatingHoursText,
            startTime: selectedAccommodation.operatingHours
              ? formatMinutesToClock(
                  selectedAccommodation.operatingHours.startMinutes,
                )
              : null,
            endTime: selectedAccommodation.operatingHours
              ? formatMinutesToClock(
                  selectedAccommodation.operatingHours.endMinutes,
                )
              : null,
          },
          location: {
            latitude: selectedAccommodation.latitude,
            longitude: selectedAccommodation.longitude,
          },
          travel: {
            from: {
              latitude: currentPoint.latitude,
              longitude: currentPoint.longitude,
            },
            distanceKm: Number(travelDistanceKm.toFixed(2)),
            estimatedTravelMinutes: Number(
              travelEstimate.rawMinutes.toFixed(1),
            ),
            estimatedTravelSlotMinutes: Math.ceil(travelEstimate.slotMinutes),
          },
          estimatedTravelMinutes: Number(travelEstimate.rawMinutes.toFixed(1)),
          estimatedTravelText: `${travelEstimate.rawMinutes.toFixed(1)} menit`,
          estimatedTravelSlotMinutes: Math.ceil(travelEstimate.slotMinutes),
          schedule: {
            arrivalTime: checkInTime.toISOString(),
            visitStartTime: checkInTime.toISOString(),
            visitEndTime: null,
            waitingMinutes: 0,
            operatingHours: selectedAccommodation.operatingHoursText,
          },
          estimatedVisitDurationMinutes: 0,
          travelDurationBonusMinutes: 0,
          visitDurationSource: "checkin-start-only",
          sourceType: selectedAccommodation.sourceType || "akomodasi",
          totalConsumedMinutes: Math.ceil(travelEstimate.slotMinutes),
          isLunchStop: false,
          isAccommodationStop: true,
          priorityReason: "Akomodasi dipilih terdekat untuk check-in",
          checkInOnly: true,
          alternatives: accommodationRecommendations
            .filter((alt) => alt.destinationId !== selectedAccommodation.id)
            .slice(0, 3),
        };

        dayPlan.visits.push(accommodationVisit);
        chosenStops.push(accommodationVisit);
        selectedDestinationIds.add(accommodationVisit.destinationId);
        accommodationAdded = true;
        accommodationVisitName = accommodationVisit.destinationName;
        accommodationScheduledForTrip = true;
        accommodationRecommendations = accommodationVisit.alternatives;
      }
    }

    if (dayPlan.visits.length === 0) {
      dayPlan.usedMinutes = 0;
      dayPlan.remainingMinutes = Math.floor(
        dayPlan.activeWindow.availableMinutes,
      );
    }

    dayPlan.lunchStop = {
      requested: lunchStopRequested,
      fulfilled: lunchStopRequested ? lunchStopAdded : false,
      destinationName: lunchStopVisitName,
      targetWindow: lunchWindow
        ? {
            start: lunchWindow.start.toISOString(),
            end: lunchWindow.end.toISOString(),
          }
        : null,
    };
    dayPlan.lunchRecommendations = lunchRecommendations;
    dayPlan.accommodationStop = {
      requested: accommodationRequested,
      fulfilled: accommodationRequested ? accommodationAdded : false,
      destinationName: accommodationVisitName,
      unavailableReason:
        accommodationRequested && dayIndex > accommodationTargetDayIndex
          ? "Akomodasi hanya dijadwalkan 1 kali di hari pertama"
          : accommodationRequested &&
              dayIndex === accommodationTargetDayIndex &&
              !accommodationAdded
            ? "Tidak ada kandidat akomodasi yang tersedia"
            : null,
      usedFallbackWindow:
        accommodationRequested && dayIndex === accommodationTargetDayIndex,
      targetWindow:
        accommodationRequested && dayIndex === accommodationTargetDayIndex
          ? { start: dayEnd.toISOString(), end: dayEnd.toISOString() }
          : null,
    };
    dayPlan.accommodationRecommendations = accommodationRecommendations;

    if (dayPlan.visits.length > 0) {
      const lastVisit = dayPlan.visits[dayPlan.visits.length - 1];
      lastDayEndPoint = {
        latitude: lastVisit.location.latitude,
        longitude: lastVisit.location.longitude,
      };
    }
    if (destinationLimit && totalTourismStopsSelected >= destinationLimit)
      break;
  }

  const totalAvailableMinutes = itineraryByDay.reduce(
    (sum, dayPlan) => sum + dayPlan.activeWindow.availableMinutes,
    0,
  );
  const totalUsedMinutes = itineraryByDay.reduce(
    (sum, dayPlan) => sum + dayPlan.usedMinutes,
    0,
  );
  const fulfilledLunchDays = itineraryByDay.filter(
    (dayPlan) => dayPlan.lunchStop && dayPlan.lunchStop.fulfilled,
  ).length;
  const fulfilledAccommodationDays = itineraryByDay.filter(
    (dayPlan) =>
      dayPlan.accommodationStop && dayPlan.accommodationStop.fulfilled,
  ).length;

  await applyRoadMetricsToItinerary({ itineraryByDay, userPoint, speed });

  // Calculate travelMetrics from itinerary data
  const totalDistance = itineraryByDay.reduce(
    (sum, day) => sum + (day.totalDistance || 0),
    0,
  );
  const totalTravelTime = itineraryByDay.reduce(
    (sum, day) => sum + (day.totalTime || 0),
    0,
  );
  const totalDays = itineraryByDay.length;

  const normalizedItineraryByDay = itineraryByDay.map((dayPlan, dayIndex) => ({
    ...dayPlan,
    visits: Array.isArray(dayPlan?.visits)
      ? dayPlan.visits.map((visit, visitIndex) => ({
          ...visit,
          // <--- INI DIA
          stopInstanceId:
            visit?.stopInstanceId ??
            String(visit?.visitOrder ?? visit?.order ?? visitIndex + 1),
        }))
      : [],
  }));

  const normalizedRecommendedDestinations = chosenStops.map(
    (stop, stopIndex) => ({
      ...stop,
      stopInstanceId:
        stop?.stopInstanceId ??
        String(stop?.order ?? stop?.visitOrder ?? stopIndex + 1),
    }),
  );

  return {
    itineraryByDay: normalizedItineraryByDay,
    simpleItinerary: buildSimpleItineraryView(normalizedItineraryByDay),
    recommendedDestinations: normalizedRecommendedDestinations,
    travelMetrics: {
      totalDays,
      totalDistance: Math.round(totalDistance * 10) / 10, // Round to 1 decimal
      totalTravelTime: totalTravelTime, // Already in HH:MM format from itinerary
      totalWisataStops: totalTourismStopsSelected,
      avgDistancePerDay:
        totalDays > 0 ? Math.round((totalDistance / totalDays) * 10) / 10 : 0,
    },
    route: {
      startLocation: userPoint,
      orderedStops: normalizedRecommendedDestinations.map((stop) => ({
        order: stop.order,
        stopInstanceId: stop.stopInstanceId,
        destinationId: stop.destinationId,
        destinationName: stop.destinationName,
        latitude: stop.location.latitude,
        longitude: stop.location.longitude,
      })),
    },
    summary: {
      activeTourismMinutes: Math.floor(totalAvailableMinutes),
      usedMinutes: totalUsedMinutes,
      remainingMinutes: Math.max(
        0,
        Math.floor(totalAvailableMinutes - totalUsedMinutes),
      ),
      totalCandidates: orderedCandidates.length,
      selectedDestinations: chosenStops.length,
      selectedTourismDestinations: totalTourismStopsSelected,
      appliedPreferences: normalizedPreference,
      averageSpeedKmh: speed,
      activeHoursRule,
      destinationLimit,
      destinationLimitScope: "wisata-only",
      visitDurationMode,
      lunchStopRequested,
      lunchWindow: `${formatMinutesToClock(LUNCH_WINDOW_START_MINUTES)}-${formatMinutesToClock(LUNCH_WINDOW_END_MINUTES)}`,
      lunchCandidatesFromTempatMakan: lunchCandidates.length,
      lunchCandidatesSourceError: lunchCandidatesLoadError
        ? lunchCandidatesLoadError.message
        : null,
      lunchStopsFulfilledDays: fulfilledLunchDays,
      lunchStopsMissingDays: lunchStopRequested
        ? Math.max(0, itineraryByDay.length - fulfilledLunchDays)
        : 0,
      accommodationRequested,
      accommodationWindow: `${formatMinutesToClock(ACCOMMODATION_WINDOW_START_MINUTES)}-${formatMinutesToClock(ACCOMMODATION_WINDOW_END_MINUTES)}`,
      accommodationCandidatesCount: accommodationCandidates.length,
      accommodationCandidatesSourceError: accommodationCandidatesLoadError
        ? accommodationCandidatesLoadError.message
        : null,
      accommodationFulfilledDays: fulfilledAccommodationDays,
      accommodationMissingDays: accommodationRequested
        ? Math.max(0, itineraryByDay.length - fulfilledAccommodationDays)
        : 0,
    },
  };
}

// ==========================================
// BAGIAN FITUR REPLACEMENT & DEBUGGING
// ==========================================

function extractDraftItinerary(payload) {
  const draft =
    payload?.draftItinerary || payload?.itinerary || payload?.data || null;
  if (!draft || !Array.isArray(draft.itineraryByDay))
    throw new Error(
      "draftItinerary wajib diisi dan harus punya itineraryByDay",
    );
  return draft;
}

function findDraftStop(draftItinerary, stopId) {
  const stopIdText = String(stopId);
  for (
    let dayIndex = 0;
    dayIndex < draftItinerary.itineraryByDay.length;
    dayIndex += 1
  ) {
    const dayPlan = draftItinerary.itineraryByDay[dayIndex];
    if (!Array.isArray(dayPlan.visits)) continue;
    for (
      let visitIndex = 0;
      visitIndex < dayPlan.visits.length;
      visitIndex += 1
    ) {
      const visit = dayPlan.visits[visitIndex];
      if (String(visit.destinationId) === stopIdText)
        return { dayIndex, visitIndex, dayPlan, visit };
    }
  }
  return null;
}

function getDraftUsedDestinationIds(draftItinerary) {
  const ids = new Set();
  for (const dayPlan of draftItinerary.itineraryByDay) {
    if (!Array.isArray(dayPlan.visits)) continue;
    for (const visit of dayPlan.visits) {
      if (visit?.destinationId !== undefined && visit?.destinationId !== null)
        ids.add(String(visit.destinationId));
    }
  }
  return ids;
}

function getReplacementAnchors(draftItinerary, targetLocation) {
  const currentDayVisits = draftItinerary.currentDayVisits || [];
  const currentDayIndex = draftItinerary.currentDayIndex || 0;
  const currentVisitIndex = draftItinerary.currentVisitIndex || 0;
  const prevVisit =
    currentVisitIndex > 0 ? currentDayVisits[currentVisitIndex - 1] : null;
  const nextVisit =
    currentVisitIndex < currentDayVisits.length - 1
      ? currentDayVisits[currentVisitIndex + 1]
      : null;
  const startLocation = draftItinerary.route?.startLocation || null;

  return {
    dayIndex: currentDayIndex,
    visitIndex: currentVisitIndex,
    prevAnchor: prevVisit?.location || startLocation || targetLocation || null,
    nextAnchor: nextVisit?.location || null,
    prevVisit,
    nextVisit,
  };
}

async function buildItineraryReplacementPreview(payload) {
  const draft = extractDraftItinerary(payload);
  const stopId = payload.stopId || payload.destinationId;
  if (!stopId) throw new Error("stopId wajib diisi");

  const found = findDraftStop(draft, stopId);
  if (!found)
    throw new Error(`Stop dengan ID ${stopId} tidak ditemukan di draft`);
  if (found.visit.isLunchStop || found.visit.isAccommodationStop)
    throw new Error(
      "Fitur replace ini hanya untuk stop wisata, bukan lunch/akomodasi",
    );

  const sameCategoryOnly = payload.sameCategoryOnly !== false;
  const limit = Math.max(1, parseNumber(payload.limit) || 5);
  const speed =
    parseNumber(payload.averageSpeedKmh) ||
    draft.summary?.averageSpeedKmh ||
    DEFAULT_TRAVEL_SPEED_KMH;
  const usedDestinationIds = getDraftUsedDestinationIds(draft);

  const wisataData = await getAllWisata();
  const candidates = wisataData
    .map(mapDestination)
    .filter((item) => item.latitude !== null && item.longitude !== null)
    .filter((item) => String(item.id) !== String(found.visit.destinationId))
    .filter((item) => !usedDestinationIds.has(String(item.id)));

  const targetCategoryTokens = found.visit.categories?.length
    ? found.visit.categories
    : normalizeCategoryTokens(found.visit.category);
  const filteredCandidates = sameCategoryOnly
    ? candidates.filter((item) =>
        categoryMatchesPreference(item.categoryTokens, targetCategoryTokens),
      )
    : candidates;

  const draftForAnchors = {
    itineraryByDay: draft.itineraryByDay,
    route: draft.route,
    currentDayVisits: found.dayPlan.visits,
    currentDayIndex: found.dayIndex,
    currentVisitIndex: found.visitIndex,
  };
  const { prevAnchor, nextAnchor, prevVisit, nextVisit } =
    getReplacementAnchors(draftForAnchors, found.visit.location);

  const targetPrevDistanceKm = prevAnchor
    ? haversineDistanceKm(prevAnchor, found.visit.location)
    : 0;
  const targetNextDistanceKm = nextAnchor
    ? haversineDistanceKm(found.visit.location, nextAnchor)
    : 0;
  const targetTravelMinutes = distanceToTravelMinutesSafe(
    targetPrevDistanceKm + targetNextDistanceKm,
    speed,
  );

  const alternatives = filteredCandidates
    .map((candidate) => {
      const prevDistanceKm = prevAnchor
        ? haversineDistanceKm(prevAnchor, candidate)
        : 0;
      const nextDistanceKm = nextAnchor
        ? haversineDistanceKm(candidate, nextAnchor)
        : 0;
      const extraDistanceKm =
        prevDistanceKm -
        targetPrevDistanceKm +
        (nextDistanceKm - targetNextDistanceKm);
      const extraTravelMinutes = distanceToTravelMinutesSafe(
        Math.max(0, extraDistanceKm),
        speed,
      );
      const score = extraDistanceKm + extraTravelMinutes * 0.05;

      return {
        destinationId: candidate.id,
        destinationName: candidate.name,
        category: candidate.category,
        categoryTokens: candidate.categoryTokens,
        sourceType: candidate.raw?.sourceType || wisataTable,
        location: {
          latitude: candidate.latitude,
          longitude: candidate.longitude,
        },
        extraDistanceKm: Number(extraDistanceKm.toFixed(2)),
        extraTravelMinutes: Number(extraTravelMinutes.toFixed(1)),
        score: Number(score.toFixed(3)),
        reason:
          extraDistanceKm <= 0
            ? "Lebih efisien atau setara"
            : "Paling minim gangguan rute",
        imageUrl: candidate.imageUrl,
        ticketPrice: candidate.ticketPrice,
        facilities: candidate.facilities,
        rating: candidate.raw?.rating || candidate.raw?.rating_bintang || null,
        categories: candidate.categoryTokens,
      };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);

  return {
    targetStop: {
      destinationId: found.visit.destinationId,
      destinationName: found.visit.destinationName,
      category: found.visit.category,
      location: found.visit.location,
      dayIndex: found.dayIndex,
      visitIndex: found.visitIndex,
    },
    anchors: {
      prev: prevVisit
        ? {
            destinationId: prevVisit.destinationId,
            destinationName: prevVisit.destinationName,
          }
        : null,
      next: nextVisit
        ? {
            destinationId: nextVisit.destinationId,
            destinationName: nextVisit.destinationName,
          }
        : null,
    },
    totalCandidates: filteredCandidates.length,
    sameCategoryOnly,
    limit,
    basis: { targetTravelMinutes: Number(targetTravelMinutes.toFixed(1)) },
    alternatives,
  };
}

function rebuildDaySchedule(dayPlan, userPoint, speed) {
  const rebuiltVisits = [];
  let currentPoint = userPoint;
  let currentTime = new Date(dayPlan.activeWindow.start);
  let usedMinutes = 0;

  for (const visit of dayPlan.visits) {
    const travelDistanceKm =
      visit.travel?.distanceKm ||
      haversineDistanceKm(currentPoint, visit.location);
    const travelMinutesRaw =
      visit.travel?.estimatedTravelMinutes ||
      distanceToTravelMinutesSafe(travelDistanceKm, speed);

    const travelMinutes = roundUpToTimeSlot(travelMinutesRaw);
    const arrivalTime = addMinutesToDate(currentTime, travelMinutes);
    const parsedOperatingHours = parseOperatingHours(
      visit.operatingHours?.text || visit.schedule?.operatingHours || null,
    );

    const dayStart = new Date(dayPlan.activeWindow.start);
    const operatingWindow = parsedOperatingHours
      ? buildOperatingWindowForDate(parsedOperatingHours, dayStart)
      : null;

    let visitStart = operatingWindow
      ? new Date(
          Math.max(arrivalTime.getTime(), operatingWindow.start.getTime()),
        )
      : arrivalTime;

    // LUNCH ENFORCER REBUILD (Relaxed)
    if (visit.isLunchStop) {
      const lunchTarget = buildDateByMinutes(
        dayStart,
        LUNCH_WINDOW_START_MINUTES,
      );

      // Hanya tahan jadwal ke 11:30 JIKA tempat tersebut benar-benar belum buka
      if (
        visitStart < lunchTarget &&
        (!operatingWindow || visitStart < operatingWindow.start)
      ) {
        visitStart = lunchTarget;
      }
    }

    const visitStartAligned = alignDateToTimeSlot(visitStart);

    // CLOSING BUFFER REBUILD
    const visitEndLimit = operatingWindow
      ? new Date(
          Math.min(
            new Date(dayPlan.activeWindow.end).getTime(),
            operatingWindow.end.getTime() - CLOSING_BUFFER_MINUTES * 60000,
          ),
        )
      : new Date(dayPlan.activeWindow.end);
    const visitEndLimitAligned = alignDateToTimeSlot(visitEndLimit, "down");

    const requestedVisitDurationMinutes = visit.isLunchStop
      ? DEFAULT_LUNCH_VISIT_DURATION_MINUTES
      : visit.isAccommodationStop
        ? DEFAULT_ACCOMMODATION_VISIT_DURATION_MINUTES
        : Math.max(
            visit.estimatedVisitDurationMinutes || 0,
            visit.minVisitDurationMinutes || 0,
          );
    const maxAllowedVisitMinutes = Math.max(
      0,
      roundDownToTimeSlot(
        dateDiffMinutes(visitEndLimitAligned, visitStartAligned),
      ),
    );

    if (maxAllowedVisitMinutes <= 0) break;

    const visitDurationMinutes = Math.min(
      requestedVisitDurationMinutes,
      maxAllowedVisitMinutes,
    );
    let visitEndTime = addMinutesToDate(
      visitStartAligned,
      visitDurationMinutes,
    );

    if (visit.checkInOnly) visitEndTime = visitStartAligned;

    const waitingMinutes = roundUpToTimeSlot(
      Math.max(0, dateDiffMinutes(visitStartAligned, arrivalTime)),
    );

    const rebuiltVisit = {
      ...visit,
      travel: {
        ...visit.travel,
        from: {
          latitude: currentPoint.latitude,
          longitude: currentPoint.longitude,
        },
        distanceKm: Number(travelDistanceKm.toFixed(2)),
        estimatedTravelMinutes: Number(travelMinutesRaw.toFixed(1)),
        estimatedTravelSlotMinutes: Math.ceil(travelMinutes),
      },
      estimatedTravelMinutes: Number(travelMinutesRaw.toFixed(1)),
      estimatedTravelText: `${travelMinutesRaw.toFixed(1)} menit`,
      estimatedTravelSlotMinutes: Math.ceil(travelMinutes),
      schedule: {
        ...visit.schedule,
        arrivalTime: arrivalTime.toISOString(),
        visitStartTime: visitStartAligned.toISOString(),
        visitEndTime: visit.checkInOnly ? null : visitEndTime.toISOString(),
        waitingMinutes: Math.ceil(waitingMinutes),
        operatingHours:
          visit.operatingHours?.text || visit.schedule?.operatingHours || null,
      },
      totalConsumedMinutes: Math.ceil(
        travelMinutes + waitingMinutes + visitDurationMinutes,
      ),
      durationClampedToWindow:
        visitDurationMinutes < requestedVisitDurationMinutes,
    };

    rebuiltVisits.push(rebuiltVisit);
    usedMinutes = Math.max(
      0,
      Math.ceil(dateDiffMinutes(visitEndTime, dayStart)),
    );
    currentPoint = {
      latitude: visit.location.latitude,
      longitude: visit.location.longitude,
    };
    currentTime = visitEndTime;
  }

  return {
    ...dayPlan,
    visits: rebuiltVisits,
    usedMinutes,
    remainingMinutes: Math.max(
      0,
      Math.floor(
        dateDiffMinutes(new Date(dayPlan.activeWindow.end), currentTime),
      ),
    ),
  };
}

async function applyItineraryReplacement(payload) {
  const draft = extractDraftItinerary(payload);
  const stopId = payload.stopId || payload.destinationId;
  const replacementDestinationId =
    payload.replacementDestinationId || payload.newDestinationId;

  if (!stopId) throw new Error("stopId wajib diisi");
  if (!replacementDestinationId)
    throw new Error("replacementDestinationId wajib diisi");

  const target = findDraftStop(draft, stopId);
  if (!target)
    throw new Error(`Stop dengan ID ${stopId} tidak ditemukan di draft`);
  if (target.visit.isLunchStop || target.visit.isAccommodationStop)
    throw new Error(
      "Fitur replace ini hanya untuk stop wisata, bukan lunch/akomodasi",
    );

  const wisataData = await getAllWisata();
  const candidateRaw = wisataData.find(
    (item) => String(item.id) === String(replacementDestinationId),
  );
  if (!candidateRaw)
    throw new Error(
      `Destinasi pengganti dengan ID ${replacementDestinationId} tidak ditemukan`,
    );

  const candidate = mapDestination(candidateRaw);
  if (candidate.latitude === null || candidate.longitude === null)
    throw new Error("Destinasi pengganti tidak memiliki koordinat valid");

  const durationPolicy = resolveVisitDurationMinutes(
    candidate,
    draft.summary?.visitDurationMode || "kategori",
  );

  const replacementVisit = {
    ...target.visit,
    destinationId: candidate.id,
    destinationName: candidate.name,
    description: candidate.description,
    ticketPrice: candidate.ticketPrice,
    imageUrl: candidate.imageUrl,
    locationLabel: candidate.locationLabel,
    category: candidate.category,
    categories: candidate.categoryTokens,
    facilities: candidate.facilities,
    location: { latitude: candidate.latitude, longitude: candidate.longitude },
    operatingHours: {
      text: candidate.operatingHoursText,
      startTime: candidate.operatingHours
        ? formatMinutesToClock(candidate.operatingHours.startMinutes)
        : null,
      endTime: candidate.operatingHours
        ? formatMinutesToClock(candidate.operatingHours.endMinutes)
        : null,
    },
    estimatedVisitDurationMinutes: durationPolicy.minutes,
    visitDurationSource: durationPolicy.source,
    finalVisitDurationMinutes: roundUpToTimeSlot(durationPolicy.minutes),
    sourceType: wisataTable,
    isLunchStop: false,
    isAccommodationStop: false,
  };

  const updatedItineraryByDay = draft.itineraryByDay.map(
    (dayPlan, dayIndex) => {
      if (dayIndex !== target.dayIndex)
        return JSON.parse(JSON.stringify(dayPlan));
      const clonedDay = JSON.parse(JSON.stringify(dayPlan));
      clonedDay.visits[target.visitIndex] = replacementVisit;
      return rebuildDaySchedule(
        clonedDay,
        draft.route?.startLocation ||
          draft.summary?.startLocation || {
            latitude: target.visit.location.latitude,
            longitude: target.visit.location.longitude,
          },
        parseNumber(payload.averageSpeedKmh) ||
          draft.summary?.averageSpeedKmh ||
          DEFAULT_TRAVEL_SPEED_KMH,
      );
    },
  );

  // OSRM RECALL TO FIX ROUTE
  await applyRoadMetricsToItinerary({
    itineraryByDay: updatedItineraryByDay,
    userPoint: draft.route?.startLocation ||
      draft.summary?.startLocation || {
        latitude: target.visit.location.latitude,
        longitude: target.visit.location.longitude,
      },
    speed:
      parseNumber(payload.averageSpeedKmh) ||
      draft.summary?.averageSpeedKmh ||
      DEFAULT_TRAVEL_SPEED_KMH,
  });

  const totalAvailableMinutes = updatedItineraryByDay.reduce(
    (sum, dayPlan) => sum + (dayPlan.activeWindow?.availableMinutes || 0),
    0,
  );
  const totalUsedMinutes = updatedItineraryByDay.reduce(
    (sum, dayPlan) => sum + (dayPlan.usedMinutes || 0),
    0,
  );

  const updatedDraft = {
    ...draft,
    itineraryByDay: updatedItineraryByDay,
    simpleItinerary: buildSimpleItineraryView(updatedItineraryByDay),
    recommendedDestinations: updatedItineraryByDay.flatMap(
      (dayPlan) => dayPlan.visits,
    ),
    route: {
      ...draft.route,
      orderedStops: updatedItineraryByDay
        .flatMap((dayPlan) => dayPlan.visits)
        .map((stop, index) => ({
          order: index + 1,
          destinationId: stop.destinationId,
          destinationName: stop.destinationName,
          latitude: stop.location.latitude,
          longitude: stop.location.longitude,
        })),
    },
    summary: {
      ...draft.summary,
      activeTourismMinutes: Math.floor(totalAvailableMinutes),
      usedMinutes: totalUsedMinutes,
      remainingMinutes: Math.max(
        0,
        Math.floor(totalAvailableMinutes - totalUsedMinutes),
      ),
    },
  };

  return {
    message: "Draft itinerary berhasil diperbarui",
    targetStop: target.visit,
    replacementStop: replacementVisit,
    updatedDraft,
  };
}
async function applyItineraryDayReorder(payload) {
  const draft = extractDraftItinerary(payload);
  const dayIndex = parseNumber(payload.dayIndex);
  
  if (dayIndex === null || dayIndex < 0 || dayIndex >= draft.itineraryByDay.length) {
    throw new Error("dayIndex tidak valid");
  }

  const speed = parseNumber(payload.averageSpeedKmh) || draft.summary?.averageSpeedKmh || DEFAULT_TRAVEL_SPEED_KMH;
  
  const updatedItineraryByDay = JSON.parse(JSON.stringify(draft.itineraryByDay));
  const dayPlan = updatedItineraryByDay[dayIndex];

  // 1. Tentukan titik mulai hari ini
  let startLocation = draft.summary?.startLocation || draft.route?.startLocation;
  if (dayIndex > 0) {
    const prevDay = updatedItineraryByDay[dayIndex - 1];
    const prevLastVisit = prevDay.visits[prevDay.visits.length - 1];
    if (prevLastVisit) {
      startLocation = {
        latitude: prevLastVisit.location.latitude,
        longitude: prevLastVisit.location.longitude,
      };
    }
  }

  if (!startLocation) {
    startLocation = {
       latitude: dayPlan.visits[0]?.location.latitude,
       longitude: dayPlan.visits[0]?.location.longitude,
    };
  }

  // 2. Bagi menjadi segmen agar makan siang dan akomodasi tidak pindah urutan logisnya
  const segments = [];
  let currentSegment = [];
  
  for (const visit of dayPlan.visits) {
    if (visit.isLunchStop || visit.isAccommodationStop || visit.sourceType === "akomodasi") {
      if (currentSegment.length > 0) {
        segments.push({ type: 'normal', visits: currentSegment });
        currentSegment = [];
      }
      segments.push({ type: 'fixed', visits: [visit] });
    } else {
      currentSegment.push(visit);
    }
  }
  if (currentSegment.length > 0) {
    segments.push({ type: 'normal', visits: currentSegment });
  }

  // 3. Urutkan tiap segmen normal (Nearest Neighbor)
  let currentPoint = startLocation;
  const reorderedVisits = [];
  
  for (const segment of segments) {
    if (segment.type === 'fixed') {
      reorderedVisits.push(segment.visits[0]);
      currentPoint = segment.visits[0].location;
    } else {
      let unvisited = [...segment.visits];
      while(unvisited.length > 0) {
        let nearestIdx = -1;
        let minDistance = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
          const dist = haversineDistanceKm(currentPoint, unvisited[i].location);
          if (dist < minDistance) {
            minDistance = dist;
            nearestIdx = i;
          }
        }
        const nearest = unvisited.splice(nearestIdx, 1)[0];
        reorderedVisits.push(nearest);
        currentPoint = nearest.location;
      }
    }
  }

  dayPlan.visits = reorderedVisits;

  // 4. Bangun ulang jam
  updatedItineraryByDay[dayIndex] = rebuildDaySchedule(dayPlan, startLocation, speed);

  // 5. Panggil OSRM
  await applyRoadMetricsToItinerary({
    itineraryByDay: updatedItineraryByDay,
    userPoint: draft.summary?.startLocation || draft.route?.startLocation,
    speed
  });

  // 6. Hitung ulang total waktu
  const totalAvailableMinutes = updatedItineraryByDay.reduce(
    (acc, day) => acc + (day.activeWindow?.durationMinutes || 0),
    0,
  );
  const totalUsedMinutes = updatedItineraryByDay.reduce(
    (acc, day) => acc + (day.usedMinutes || 0),
    0,
  );

  const updatedDraft = {
    ...draft,
    itineraryByDay: updatedItineraryByDay,
    simpleItinerary: buildSimpleItineraryView(updatedItineraryByDay),
    recommendedDestinations: updatedItineraryByDay.flatMap(day => day.visits),
    route: {
      ...draft.route,
      orderedStops: updatedItineraryByDay.flatMap(day => day.visits).map((stop, index) => ({
        order: index + 1,
        destinationId: stop.destinationId,
        destinationName: stop.destinationName,
        latitude: stop.location.latitude,
        longitude: stop.location.longitude,
      })),
    },
    summary: {
      ...draft.summary,
      usedMinutes: totalUsedMinutes,
      remainingMinutes: Math.max(0, Math.floor(totalAvailableMinutes - totalUsedMinutes)),
    }
  };

  return {
    message: "Rute hari ini berhasil diurutkan ulang",
    updatedDraft,
  };
}

async function applyItineraryAllDaysReorder(payload) {
  const draft = extractDraftItinerary(payload);
  const speed = parseNumber(payload.averageSpeedKmh) || draft.summary?.averageSpeedKmh || DEFAULT_TRAVEL_SPEED_KMH;
  const updatedItineraryByDay = JSON.parse(JSON.stringify(draft.itineraryByDay));

  for (let dayIndex = 0; dayIndex < updatedItineraryByDay.length; dayIndex++) {
    const dayPlan = updatedItineraryByDay[dayIndex];

    // 1. Tentukan titik mulai hari ini
    let startLocation = draft.summary?.startLocation || draft.route?.startLocation;
    if (dayIndex > 0) {
      const prevDay = updatedItineraryByDay[dayIndex - 1];
      const prevLastVisit = prevDay.visits[prevDay.visits.length - 1];
      if (prevLastVisit) {
        startLocation = {
          latitude: prevLastVisit.location.latitude,
          longitude: prevLastVisit.location.longitude,
        };
      }
    }
    if (!startLocation) {
      startLocation = {
         latitude: dayPlan.visits[0]?.location.latitude,
         longitude: dayPlan.visits[0]?.location.longitude,
      };
    }

    // 2. Bagi menjadi segmen agar makan siang dan akomodasi tidak pindah urutan logisnya
    const segments = [];
    let currentSegment = [];
    for (const visit of dayPlan.visits) {
      if (visit.isLunchStop || visit.isAccommodationStop || visit.sourceType === "akomodasi") {
        if (currentSegment.length > 0) {
          segments.push({ type: 'normal', visits: currentSegment });
          currentSegment = [];
        }
        segments.push({ type: 'fixed', visits: [visit] });
      } else {
        currentSegment.push(visit);
      }
    }
    if (currentSegment.length > 0) {
      segments.push({ type: 'normal', visits: currentSegment });
    }

    // 3. Urutkan tiap segmen normal (Nearest Neighbor)
    let currentPoint = startLocation;
    const reorderedVisits = [];
    for (const segment of segments) {
      if (segment.type === 'fixed') {
        reorderedVisits.push(segment.visits[0]);
        currentPoint = segment.visits[0].location;
      } else {
        let unvisited = [...segment.visits];
        while(unvisited.length > 0) {
          let nearestIdx = -1;
          let minDistance = Infinity;
          for (let i = 0; i < unvisited.length; i++) {
            const dist = haversineDistanceKm(currentPoint, unvisited[i].location);
            if (dist < minDistance) {
              minDistance = dist;
              nearestIdx = i;
            }
          }
          const nearest = unvisited.splice(nearestIdx, 1)[0];
          reorderedVisits.push(nearest);
          currentPoint = nearest.location;
        }
      }
    }

    dayPlan.visits = reorderedVisits;

    // 4. Bangun ulang jam
    updatedItineraryByDay[dayIndex] = rebuildDaySchedule(dayPlan, startLocation, speed);
  }

  // 5. Panggil OSRM untuk keseluruhan itinerary
  await applyRoadMetricsToItinerary({
    itineraryByDay: updatedItineraryByDay,
    userPoint: draft.summary?.startLocation || draft.route?.startLocation,
    speed
  });

  // 6. Hitung ulang total waktu
  const totalAvailableMinutes = updatedItineraryByDay.reduce(
    (acc, day) => acc + (day.activeWindow?.durationMinutes || 0),
    0,
  );
  const totalUsedMinutes = updatedItineraryByDay.reduce(
    (acc, day) => acc + (day.usedMinutes || 0),
    0,
  );

  const updatedDraft = {
    ...draft,
    itineraryByDay: updatedItineraryByDay,
    simpleItinerary: buildSimpleItineraryView(updatedItineraryByDay),
    recommendedDestinations: updatedItineraryByDay.flatMap(day => day.visits),
    route: {
      ...draft.route,
      orderedStops: updatedItineraryByDay.flatMap(day => day.visits).map((stop, index) => ({
        order: index + 1,
        destinationId: stop.destinationId,
        destinationName: stop.destinationName,
        latitude: stop.location.latitude,
        longitude: stop.location.longitude,
      })),
    },
    summary: {
      ...draft.summary,
      usedMinutes: totalUsedMinutes,
      remainingMinutes: Math.max(0, Math.floor(totalAvailableMinutes - totalUsedMinutes)),
    }
  };

  return {
    message: "Seluruh rute berhasil diurutkan ulang",
    updatedDraft,
  };
}

module.exports = {
  buildItineraryRecommendation,
  buildItineraryReplacementPreview,
  applyItineraryReplacement,
  applyItineraryDayReorder,
  applyItineraryAllDaysReorder,
  getAvailableWisataCategories,
};
