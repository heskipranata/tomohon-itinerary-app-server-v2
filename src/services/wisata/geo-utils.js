function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(from, to) {
  const earthRadiusKm = 6371;
  const latDistance = toRadians(to.latitude - from.latitude);
  const lonDistance = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(latDistance / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(lonDistance / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function distanceToTravelMinutes(distanceKm, speedKmh) {
  const safeSpeed = speedKmh > 0 ? speedKmh : 30;
  return (distanceKm / safeSpeed) * 60;
}

module.exports = {
  haversineDistanceKm,
  distanceToTravelMinutes,
};
