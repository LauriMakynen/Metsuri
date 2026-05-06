/**
 * Forest Data Service
 *
 * Handles fetching and processing forest stand data from external sources.
 *
 * Current status: NOT YET CONNECTED to any external API.
 * All functions return null until a real integration is implemented.
 *
 * Future integration target:
 *   Metsäkeskus – Avoin metsätieto (forest resource data)
 *   https://www.metsaan.fi/avoin-metsatieto
 *
 * When connected, this service will:
 *   1. Accept a property polygon (GeoJSON geometry)
 *   2. Intersect with Metsäkeskus forest resource grid / stand data
 *   3. Aggregate tree species volumes by species:
 *      – mänty (pine)
 *      – kuusi (spruce)
 *      – koivu (birch)
 *      – muut (other)
 *   4. Return totals and per-hectare figures
 *
 * Forest valuation (future):
 *   estimated_value_eur = Σ (species_volume_m3 * regional_stumpage_price_eur_per_m3) + land_value_eur
 */

export interface ForestStandSummary {
  pine_volume_m3: number | null;
  spruce_volume_m3: number | null;
  birch_volume_m3: number | null;
  other_volume_m3: number | null;
  total_volume_m3: number | null;
  development_class: string | null;
  soil_type: string | null;
  data_source: string | null;
  data_year: number | null;
}

export interface ForestValuationSummary {
  estimated_value_eur: number | null;
  timber_value_eur: number | null;
  land_value_eur: number | null;
  valuation_method: string | null;
}

/**
 * Fetch and aggregate forest stand data for a property polygon.
 *
 * @param _propertyId - Internal property ID (reserved for caching / future DB persistence)
 * @param _geometryGeoJSON - Property polygon as GeoJSON geometry
 * @returns ForestStandSummary or null if not yet available
 *
 * TODO: Implement real API call to Metsäkeskus.
 */
export async function fetchForestStandDataForProperty(
  _propertyId: number,
  _geometryGeoJSON: unknown
): Promise<ForestStandSummary | null> {
  // Not yet implemented – return null to trigger "not_available" response.
  return null;
}

/**
 * Calculate a forest valuation estimate for a property.
 *
 * @param _propertyId - Internal property ID
 * @param _standData - Aggregated stand data (from fetchForestStandDataForProperty)
 * @returns ForestValuationSummary or null if insufficient data
 *
 * TODO: Integrate with regional stumpage price data (e.g. Luke / Metsäkeskus).
 */
export async function calculateForestValuation(
  _propertyId: number,
  _standData: ForestStandSummary | null
): Promise<ForestValuationSummary | null> {
  // Cannot produce a reliable estimate without real stand data and price data.
  return null;
}
