const supabase = require("../config/supabase");
const { haversineDistanceKm } = require("./wisata/geo-utils");
const {
  normalizeCategoryTokens,
  categoryMatchesPreference,
} = require("./wisata/category-utils");
const { buildWisataDataAccess } = require("./wisata/data-access");
const { buildWisataMappers } = require("./wisata/mappers");
const {
  getOsrmBaseUrl,
  getOsrmProfile,
  getRoadDistancesFromOsrm,
  getMatrixDistancesFromOsrm,
  resolveUserPositionFromOsrm,
} = require("./wisata/osrm-client");

const DEFAULT_TRAVEL_SPEED_KMH = 30;
const DEBUG_NEAREST_INITIAL_CANDIDATE_MULTIPLIER = 3;
const DEBUG_NEAREST_MIN_INITIAL_CANDIDATES = 20;
const DEBUG_NEAREST_EXPANSION_STEP_MULTIPLIER = 2;

const { getAllWisata } = buildWisataDataAccess({
  supabase,
  normalizeCategoryTokens,
});

const { mapDestination } = buildWisataMappers({
  normalizeCategoryTokens,
});

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

  if (latitude === null || longitude === null) {
    throw new Error("koordinat wajib diisi (latitude dan longitude)");
  }

  return { latitude, longitude };
}

function normalizeJenisWisata(input) {
  const jenis = getFirstAvailableValue(input, ["jenisWisata", "preferences"]);
  const normalized = normalizePreference(jenis);

  const hasAllPreference = normalized.some((item) =>
    ["semua", "all", "any", "all categories", "semua kategori"].includes(item),
  );

  if (hasAllPreference) {
    return [];
  }

  return normalized;
}

function resolveDestinationLimit(input) {
  const limitValue = parseNumber(
    getFirstAvailableValue(input, ["jumlahTempatWisata", "maxDestinations"]),
  );

  if (limitValue === null) return null;
  if (limitValue < 1) {
    throw new Error("jumlahTempatWisata harus minimal 1");
  }

  return Math.floor(limitValue);
}

async function buildNearestDestinationsDebugCore(
  payload,
  { categoryFilter = [] } = {},
) {
  const userPoint = resolveUserPoint(payload);
  const requestedLimit = resolveDestinationLimit(payload);
  const limit = requestedLimit ?? 10;
  let userPosition = null;

  try {
    userPosition = await resolveUserPositionFromOsrm(userPoint);
  } catch (error) {
    userPosition = null;
  }

  const wisataData = await getAllWisata();

  const normalizedCategoryFilter = Array.isArray(categoryFilter)
    ? categoryFilter
        .map((item) => String(item).trim().toLowerCase())
        .filter((item) => item.length > 0)
    : [];

  const candidates = wisataData
    .map(mapDestination)
    .filter((item) => item.latitude !== null && item.longitude !== null)
    .filter((item) =>
      normalizedCategoryFilter.length === 0
        ? true
        : categoryMatchesPreference(
            item.categoryTokens,
            normalizedCategoryFilter,
          ),
    )
    .map((item) => ({
      ...item,
      straightDistanceKm: haversineDistanceKm(userPoint, item),
    }))
    .sort((a, b) => a.straightDistanceKm - b.straightDistanceKm);

  const toDebugDestination = (item, roadDistanceMeters = null) => {
    const roadDistanceKm =
      Number.isFinite(roadDistanceMeters) && roadDistanceMeters !== null
        ? roadDistanceMeters / 1000
        : null;

    return {
      name: item.name,
      location: {
        latitude: item.latitude,
        longitude: item.longitude,
      },
      roadDistanceKm:
        roadDistanceKm === null ? null : Number(roadDistanceKm.toFixed(2)),
      roadDistanceMeters,
      straightDistanceKm: Number(item.straightDistanceKm.toFixed(2)),
      category: item.category,
      routeProvider: roadDistanceMeters === null ? "haversine" : "osrm",
    };
  };

  const initialCandidateCount = Math.min(
    candidates.length,
    Math.max(
      DEBUG_NEAREST_MIN_INITIAL_CANDIDATES,
      limit * DEBUG_NEAREST_INITIAL_CANDIDATE_MULTIPLIER,
    ),
  );
  const expansionStep = Math.max(
    limit * DEBUG_NEAREST_EXPANSION_STEP_MULTIPLIER,
    1,
  );
  const evaluatedCandidates = [];
  const evaluatedIds = new Set();
  let evaluatedCount = 0;
  let osrmError = null;

  while (evaluatedCount < candidates.length) {
    const remainingCandidates = candidates.length - evaluatedCount;
    const targetBatchSize =
      evaluatedCount === 0 ? initialCandidateCount : expansionStep;
    const batchSize = Math.min(targetBatchSize, remainingCandidates);
    const batch = candidates.slice(evaluatedCount, evaluatedCount + batchSize);

    if (batch.length === 0) {
      break;
    }

    evaluatedCount += batch.length;

    try {
      const roadDistancesById = await getRoadDistancesFromOsrm(
        userPoint,
        batch,
      );

      for (const item of batch) {
        const roadDistanceMeters =
          roadDistancesById.get(item.id)?.roadDistanceMeters ?? null;

        evaluatedCandidates.push(toDebugDestination(item, roadDistanceMeters));
        evaluatedIds.add(item.id);
      }
    } catch (error) {
      osrmError = error;
      break;
    }

    const osrmResolvedCount = evaluatedCandidates.filter(
      (item) => item.roadDistanceKm !== null,
    ).length;

    if (osrmResolvedCount >= limit) {
      break;
    }
  }

  if (osrmError) {
    for (const item of candidates) {
      if (evaluatedIds.has(item.id)) {
        continue;
      }

      evaluatedCandidates.push(toDebugDestination(item));
      evaluatedIds.add(item.id);
    }
  } else {
    for (let index = evaluatedCount; index < candidates.length; index += 1) {
      const item = candidates[index];

      evaluatedCandidates.push(toDebugDestination(item));
      evaluatedIds.add(item.id);
    }
  }

  const nearestDestinations = evaluatedCandidates
    .sort((a, b) => {
      if (a.roadDistanceKm !== null && b.roadDistanceKm !== null) {
        return a.roadDistanceKm - b.roadDistanceKm;
      }

      if (a.roadDistanceKm !== null) return -1;
      if (b.roadDistanceKm !== null) return 1;

      return a.straightDistanceKm - b.straightDistanceKm;
    })
    .slice(0, limit);

  return {
    inputPoint: userPoint,
    userPosition,
    osrm: {
      provider: getOsrmBaseUrl(),
      profile: getOsrmProfile(),
      osrmResolved: nearestDestinations.filter(
        (item) => item.routeProvider === "osrm",
      ).length,
      fallbackUsed: osrmError !== null,
      fallbackReason: osrmError ? osrmError.message : null,
    },
    totalCandidates: nearestDestinations.length,
    limit,
    nearestDestinations,
  };
}

async function buildNearestDestinationsDebug(payload) {
  return buildNearestDestinationsDebugCore(payload);
}

async function buildNearestDestinationsOnlyDebug(payload) {
  const result = await buildNearestDestinationsDebug(payload);

  return {
    inputPoint: result.inputPoint,
    osrm: result.osrm,
    totalCandidates: result.totalCandidates,
    limit: result.limit,
    nearestDestinations: result.nearestDestinations.map((item, index) => ({
      rank: index + 1,
      name: item.name,
      location: item.location,
      distanceKm: item.roadDistanceKm ?? item.straightDistanceKm,
      distanceMeters:
        item.roadDistanceMeters ?? Math.round(item.straightDistanceKm * 1000),
      distanceSource:
        item.routeProvider === "osrm"
          ? "road-osrm"
          : "straight-haversine-fallback",
    })),
  };
}

async function buildNearestDestinationsOnlyDebugByCategory(payload) {
  const normalizedPreference = normalizeJenisWisata(payload);
  const result = await buildNearestDestinationsDebugCore(payload, {
    categoryFilter: normalizedPreference,
  });

  return {
    appliedPreferences: normalizedPreference,
    inputPoint: result.inputPoint,
    osrm: result.osrm,
    totalCandidates: result.totalCandidates,
    limit: result.limit,
    nearestDestinations: result.nearestDestinations.map((item, index) => ({
      rank: index + 1,
      name: item.name,
      location: item.location,
      distanceKm: item.roadDistanceKm ?? item.straightDistanceKm,
      distanceMeters:
        item.roadDistanceMeters ?? Math.round(item.straightDistanceKm * 1000),
      category: item.category,
      distanceSource:
        item.routeProvider === "osrm"
          ? "road-osrm"
          : "straight-haversine-fallback",
    })),
  };
}

module.exports = {
  buildNearestDestinationsDebug,
  buildNearestDestinationsOnlyDebug,
  buildNearestDestinationsOnlyDebugByCategory,
};
