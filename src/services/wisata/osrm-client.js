const http = require("node:http");
const https = require("node:https");

const DEFAULT_OSRM_BASE_URL = "https://router.project-osrm.org";
const DEFAULT_OSRM_PROFILE = "driving";
const OSRM_TABLE_CHUNK_SIZE = 50;
const OSRM_TIMEOUT_MS = 10000;

function getOsrmBaseUrl() {
  return String(process.env.OSRM_BASE_URL || DEFAULT_OSRM_BASE_URL).replace(
    /\/$/,
    "",
  );
}

function getOsrmProfile() {
  return String(process.env.OSRM_PROFILE || DEFAULT_OSRM_PROFILE).trim();
}

function buildOsrmTableUrl(sourcePoint, destinationPoints) {
  const baseUrl = getOsrmBaseUrl();
  const profile = getOsrmProfile();
  const coordinates = [sourcePoint, ...destinationPoints]
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(";");

  const destinationIndexes = destinationPoints
    .map((_, index) => index + 1)
    .join(";");

  const url = new URL(`${baseUrl}/table/v1/${profile}/${coordinates}`);
  url.searchParams.set("sources", "0");
  url.searchParams.set("destinations", destinationIndexes);
  url.searchParams.set("annotations", "distance");
  url.searchParams.set("fallback_speed", "30");
  url.searchParams.set("fallback_coordinate", "snapped");

  return url.toString();
}

function buildOsrmMatrixUrl(points) {
  const baseUrl = getOsrmBaseUrl();
  const profile = getOsrmProfile();
  const coordinates = points
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(";");

  const url = new URL(`${baseUrl}/table/v1/${profile}/${coordinates}`);
  url.searchParams.set("annotations", "distance,duration");
  url.searchParams.set("fallback_speed", "30");
  url.searchParams.set("fallback_coordinate", "snapped");

  return url.toString();
}

function buildOsrmNearestUrl(point) {
  const baseUrl = getOsrmBaseUrl();
  const profile = getOsrmProfile();
  const coordinate = `${point.longitude},${point.latitude}`;
  const url = new URL(`${baseUrl}/nearest/v1/${profile}/${coordinate}`);

  url.searchParams.set("number", "1");

  return url.toString();
}

function requestJson(urlString) {
  const url = new URL(urlString);
  const transport = url.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const request = transport.get(url, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(
            new Error(
              `OSRM request gagal dengan status ${response.statusCode}`,
            ),
          );
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error("Respons OSRM tidak valid JSON"));
        }
      });
    });

    request.setTimeout(OSRM_TIMEOUT_MS, () => {
      request.destroy(new Error("Request OSRM timeout"));
    });

    request.on("error", reject);
  });
}

async function getRoadDistancesFromOsrm(sourcePoint, destinations) {
  const distancesById = new Map();

  for (
    let index = 0;
    index < destinations.length;
    index += OSRM_TABLE_CHUNK_SIZE
  ) {
    const chunk = destinations.slice(index, index + OSRM_TABLE_CHUNK_SIZE);
    const url = buildOsrmTableUrl(sourcePoint, chunk);
    const response = await requestJson(url);

    if (response.code !== "Ok" || !Array.isArray(response.distances)) {
      throw new Error(response.message || "OSRM tidak dapat menghitung jarak");
    }

    const distancesRow = response.distances[0] || [];

    chunk.forEach((destination, chunkIndex) => {
      const distanceMeters = distancesRow[chunkIndex];

      distancesById.set(destination.id, {
        roadDistanceMeters:
          Number.isFinite(distanceMeters) && distanceMeters >= 0
            ? Math.round(distanceMeters)
            : null,
      });
    });
  }

  return distancesById;
}

async function getMatrixDistancesFromOsrm(points) {
  if (!points || points.length < 2) {
    throw new Error("Minimal 2 points diperlukan untuk matrix distance");
  }

  if (points.length > 100) {
    throw new Error("Maximum 100 points untuk matrix distance");
  }

  const url = buildOsrmMatrixUrl(points);
  const response = await requestJson(url);

  if (response.code !== "Ok" || !Array.isArray(response.distances)) {
    throw new Error(response.message || "OSRM matrix tidak dapat dihitung");
  }

  return {
    distances: response.distances,
    durations: response.durations || null,
  };
}

async function resolveUserPositionFromOsrm(point) {
  const url = buildOsrmNearestUrl(point);
  const response = await requestJson(url);

  if (response.code !== "Ok" || !Array.isArray(response.waypoints)) {
    throw new Error(
      response.message || "OSRM tidak dapat menentukan posisi user",
    );
  }

  const nearestWaypoint = response.waypoints[0];

  if (!nearestWaypoint) {
    return null;
  }

  const snappedLocation = Array.isArray(nearestWaypoint.location)
    ? {
        longitude: nearestWaypoint.location[0],
        latitude: nearestWaypoint.location[1],
      }
    : null;

  const positionName =
    typeof nearestWaypoint.name === "string" &&
    nearestWaypoint.name.trim().length > 0
      ? nearestWaypoint.name.trim()
      : null;

  return {
    positionName,
    snappedLocation,
    snappedDistanceMeters:
      Number.isFinite(nearestWaypoint.distance) && nearestWaypoint.distance >= 0
        ? Math.round(nearestWaypoint.distance)
        : null,
  };
}

module.exports = {
  getOsrmBaseUrl,
  getOsrmProfile,
  getRoadDistancesFromOsrm,
  getMatrixDistancesFromOsrm,
  resolveUserPositionFromOsrm,
};
