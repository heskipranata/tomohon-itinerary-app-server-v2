function normalizeCategoryTokens(categoryValue) {
  if (!categoryValue) return [];

  return String(categoryValue)
    .toLowerCase()
    .split(/[,/|]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function categoryMatchesPreference(categoryValue, preferences) {
  if (preferences.length === 0) return true;

  const tokens =
    Array.isArray(categoryValue) && categoryValue.length > 0
      ? categoryValue
      : normalizeCategoryTokens(categoryValue);

  if (tokens.length === 0) return false;

  return preferences.some((pref) => tokens.includes(pref));
}

module.exports = {
  normalizeCategoryTokens,
  categoryMatchesPreference,
};
