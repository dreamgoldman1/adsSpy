const baseUrl = import.meta.env.VITE_META_GRAPH_BASE_URL || 'https://graph.facebook.com'
const apiVersion = import.meta.env.VITE_META_GRAPH_API_VERSION || 'v20.0'
const envAccessToken = import.meta.env.VITE_META_ACCESS_TOKEN
const envDefaultPageSize = Number(import.meta.env.VITE_META_DEFAULT_PAGE_SIZE || 100)
const fallbackGlobalReachedCountries = [
  'US', 'CA', 'MX', 'CO', 'AR', 'CL', 'PE', 'EC', 'UY', 'PY', 'BO', 'VE', 'BR',
  'ES', 'PT', 'FR', 'DE', 'IT', 'NL', 'BE', 'CH', 'AT', 'IE', 'GB', 'SE', 'NO',
  'DK', 'FI', 'PL', 'CZ', 'RO', 'HU', 'GR', 'TR',
  'AU', 'NZ', 'JP', 'KR', 'IN', 'ID', 'PH', 'TH', 'VN', 'MY', 'SG', 'HK', 'TW',
  'AE', 'SA', 'IL', 'EG', 'MA', 'ZA', 'NG', 'KE',
]

function parseCountryList(rawValue) {
  if (!rawValue) {
    return fallbackGlobalReachedCountries
  }

  const parsed = String(rawValue)
    .split(',')
    .map((country) => country.trim().toUpperCase())
    .filter((country) => country.length === 2)

  return parsed.length > 0 ? parsed : fallbackGlobalReachedCountries
}

const globalReachedCountries = parseCountryList(import.meta.env.VITE_META_GLOBAL_REACHED_COUNTRIES)
const defaultPageSize = Number.isFinite(envDefaultPageSize) && envDefaultPageSize > 0
  ? envDefaultPageSize
  : 100

const basicFields = [
  'id',
  'ad_active_status',
  'page_id',
  'page_name',
  'ad_snapshot_url',
  'ad_creation_time',
  'ad_delivery_start_time',
  'ad_delivery_stop_time',
  'currency',
]

const extendedCandidateFields = [
  'ad_creative_bodies',
  'ad_creative_link_captions',
  'ad_creative_link_descriptions',
  'ad_creative_link_titles',
  'ad_creative_link_urls',
  'bylines',
  'delivery_by_region',
  'demographic_distribution',
  'estimated_audience_size',
  'eu_total_reach',
  'languages',
  'publisher_platforms',
]

function buildFields(detailed) {
  if (!detailed) {
    return basicFields
  }

  return Array.from(new Set([...basicFields, ...extendedCandidateFields]))
}

async function fetchAdsArchive({
  token,
  nextPageUrl,
  searchTerms,
  reachedCountry,
  pageSize,
  adType,
  adActiveStatus,
  startDateFrom,
  startDateTo,
  fields,
}) {
  if (nextPageUrl) {
    const response = await fetch(nextPageUrl)

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const code = body.error?.code ? ` (code ${body.error.code})` : ''
      const subcode = body.error?.error_subcode ? ` subcode ${body.error.error_subcode}` : ''
      const message = body.error?.message || `Error HTTP ${response.status}`
      const type = body.error?.type ? ` [${body.error.type}]` : ''
      throw new Error(`${message}${type}${code}${subcode}`)
    }

    return response.json()
  }

  const params = new URLSearchParams({
    access_token: token,
    search_terms: searchTerms,
    ad_type: adType,
    fields: fields.join(','),
    limit: String(pageSize),
  })

  const normalizedCountry = String(reachedCountry || '').trim().toUpperCase()
  const reachedCountries = !normalizedCountry || normalizedCountry === 'ALL'
    ? globalReachedCountries
    : [normalizedCountry]

  params.set('ad_reached_countries', JSON.stringify(reachedCountries))

  if (adActiveStatus && adActiveStatus !== 'ALL') {
    params.set('ad_active_status', adActiveStatus)
  }

  if (startDateFrom) {
    params.set('ad_delivery_date_min', startDateFrom)
  }

  if (startDateTo) {
    params.set('ad_delivery_date_max', startDateTo)
  }

  const url = `${baseUrl}/${apiVersion}/ads_archive?${params.toString()}`
  const response = await fetch(url)

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const code = body.error?.code ? ` (code ${body.error.code})` : ''
    const subcode = body.error?.error_subcode ? ` subcode ${body.error.error_subcode}` : ''
    const message = body.error?.message || `Error HTTP ${response.status}`
    const type = body.error?.type ? ` [${body.error.type}]` : ''
    throw new Error(`${message}${type}${code}${subcode}`)
  }

  return response.json()
}

export async function searchMetaAdsLibrary({
  accessToken,
  nextPageUrl,
  searchTerms,
  reachedCountry,
  pageSize = defaultPageSize,
  adType = 'ALL',
  adActiveStatus = 'ALL',
  startDateFrom,
  startDateTo,
  detailed = true,
}) {
  const token = accessToken || envAccessToken

  if (!token) {
    throw new Error('Falta access token. Puedes pegarlo en la UI o usar VITE_META_ACCESS_TOKEN en .env')
  }

  if (token.includes('|')) {
    throw new Error(
      'El token parece ser App Token (APP_ID|APP_SECRET). Ad Library API requiere User Access Token con permisos aprobados (por ejemplo, ads_read).',
    )
  }

  const fields = buildFields(detailed)

  try {
    const response = await fetchAdsArchive({
      token,
      nextPageUrl,
      searchTerms,
      reachedCountry,
      pageSize,
      adType,
      adActiveStatus,
      startDateFrom,
      startDateTo,
      fields,
    })

    const nextUrl = response.paging?.next || null

    return {
      ...response,
      meta: {
        fieldMode: detailed ? 'extended' : 'basic',
        requestedFields: fields,
        nextPageUrl: nextUrl,
        hasMore: Boolean(nextUrl),
      },
    }
  } catch (error) {
    const canFallback = detailed && /cannot query field|unknown field|param fields|invalid field/i.test(error.message)

    if (!canFallback) {
      throw error
    }

    const response = await fetchAdsArchive({
      token,
      nextPageUrl,
      searchTerms,
      reachedCountry,
      pageSize,
      adType,
      adActiveStatus,
      startDateFrom,
      startDateTo,
      fields: basicFields,
    })

    const nextUrl = response.paging?.next || null

    return {
      ...response,
      meta: {
        fieldMode: 'basic-fallback',
        requestedFields: basicFields,
        nextPageUrl: nextUrl,
        hasMore: Boolean(nextUrl),
        warning:
          'Algunos campos avanzados no están habilitados para este token/app. Se usó un conjunto básico para completar la consulta.',
      },
    }
  }
}