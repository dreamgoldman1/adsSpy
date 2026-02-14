import React, { useEffect, useMemo, useState } from 'react'
import { searchMetaAdsLibrary } from './services/metaAdsService'

const tokenStorageKey = 'meta_access_token'

const platformIcons = {
  facebook: '📘',
  instagram: '📸',
  messenger: '💬',
  audience_network: '🕸️',
  whatsapp: '🟢',
  threads: '🧵',
}

const languageFlags = {
  es: '🇪🇸',
  en: '🇺🇸',
  pt: '🇧🇷',
  fr: '🇫🇷',
  de: '🇩🇪',
  it: '🇮🇹',
  nl: '🇳🇱',
  pl: '🇵🇱',
  ru: '🇷🇺',
  tr: '🇹🇷',
  ar: '🇸🇦',
  hi: '🇮🇳',
  ja: '🇯🇵',
  ko: '🇰🇷',
  zh: '🇨🇳',
}

function getStoredToken() {
  try {
    return localStorage.getItem(tokenStorageKey) || ''
  } catch {
    return ''
  }
}

function setStoredToken(token) {
  try {
    localStorage.setItem(tokenStorageKey, token)
  } catch {
    return
  }
}

function normalizeValue(value) {
  if (!value) {
    return ''
  }

  return String(value).trim().toLowerCase()
}

function firstOrEmpty(value) {
  if (Array.isArray(value)) {
    return value[0] || ''
  }

  return value || ''
}

function buildCreativeFingerprint(ad) {
  const pageId = normalizeValue(ad.page_id)
  const body = normalizeValue(firstOrEmpty(ad.ad_creative_bodies))
  const title = normalizeValue(firstOrEmpty(ad.ad_creative_link_titles))
  const caption = normalizeValue(firstOrEmpty(ad.ad_creative_link_captions))
  const description = normalizeValue(firstOrEmpty(ad.ad_creative_link_descriptions))

  return [pageId, body, title, caption, description].join('|')
}

function getDetectedCopies(ad, copiesMap) {
  const fingerprint = buildCreativeFingerprint(ad)
  return copiesMap.get(fingerprint) || 1
}

function collectUrlStringsFromAd(ad) {
  const urlRegex = /https?:\/\/[^\s"'<>())]+/gi
  const urls = new Set()
  const visited = new Set()
  const queue = [ad]

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current || visited.has(current)) {
      continue
    }

    if (typeof current === 'string') {
      const matches = current.match(urlRegex)
      if (matches) {
        for (const match of matches) {
          urls.add(match.trim())
        }
      }
      continue
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item)
      }
      continue
    }

    if (typeof current === 'object') {
      visited.add(current)
      for (const value of Object.values(current)) {
        queue.push(value)
      }
    }
  }

  return Array.from(urls)
}

function getHostname(urlString) {
  try {
    return new URL(urlString).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

function extractNestedUrls(urlString) {
  const nested = []

  try {
    const parsed = new URL(urlString)
    for (const [, value] of parsed.searchParams.entries()) {
      if (/^https?:\/\//i.test(value)) {
        nested.push(value)
        continue
      }

      try {
        const decoded = decodeURIComponent(value)
        if (/^https?:\/\//i.test(decoded)) {
          nested.push(decoded)
        }
      } catch {
        continue
      }
    }
  } catch {
    return []
  }

  return nested
}

function collectHostnamesFromAd(ad) {
  const rawUrls = collectUrlStringsFromAd(ad)
  const allUrls = new Set(rawUrls)

  for (const url of rawUrls) {
    const nested = extractNestedUrls(url)
    for (const nestedUrl of nested) {
      allUrls.add(nestedUrl)
    }
  }

  const hosts = new Set()
  for (const url of allUrls) {
    const host = getHostname(url)
    if (host) {
      hosts.add(host)
    }
  }

  return Array.from(hosts)
}

function getAdStartDateValue(ad) {
  const rawValue = ad.ad_delivery_start_time || ad.ad_creation_time
  if (!rawValue) {
    return null
  }

  const parsed = new Date(rawValue)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
}

function toDateStart(dateString) {
  if (!dateString) {
    return null
  }

  return new Date(`${dateString}T00:00:00`)
}

function toDateEnd(dateString) {
  if (!dateString) {
    return null
  }

  return new Date(`${dateString}T23:59:59`)
}

function matchesDateRange(ad, fromDate, toDate) {
  if (!fromDate && !toDate) {
    return true
  }

  const adStartDate = getAdStartDateValue(ad)
  if (!adStartDate) {
    return false
  }

  if (fromDate && adStartDate < fromDate) {
    return false
  }

  if (toDate && adStartDate > toDate) {
    return false
  }

  return true
}

function getCampaignDurationText(ad) {
  const startRaw = ad.ad_delivery_start_time || ad.ad_creation_time
  if (!startRaw) {
    return 'N/D'
  }

  const startDate = new Date(startRaw)
  if (Number.isNaN(startDate.getTime())) {
    return 'N/D'
  }

  const stopRaw = ad.ad_delivery_stop_time
  const endDate = stopRaw ? new Date(stopRaw) : new Date()

  if (Number.isNaN(endDate.getTime())) {
    return 'N/D'
  }

  const diffMs = Math.max(0, endDate.getTime() - startDate.getTime())
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (stopRaw) {
    return `${days} día(s) activa (finalizada)`
  }

  return `${days} día(s) activa (en curso)`
}

function getCopiesBadgeClass(copies) {
  if (copies > 25) {
    return 'copies-high'
  }

  if (copies > 5) {
    return 'copies-medium'
  }

  return 'copies-low'
}

function getStatusInfo(ad) {
  const status = normalizeValue(ad.ad_active_status)

  if (status === 'active' || status === 'active_non_political' || status === 'active_political') {
    return { label: 'ACTIVO', className: 'active' }
  }

  if (status === 'inactive') {
    return { label: 'INACTIVO', className: 'inactive' }
  }

  if (!ad.ad_delivery_stop_time) {
    return { label: 'ACTIVO', className: 'active' }
  }

  return { label: 'INACTIVO', className: 'inactive' }
}

function toReadableLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getPlatformChips(platforms) {
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return []
  }

  return platforms.map((platform) => {
    const normalized = normalizeValue(platform)
    return {
      key: normalized || String(platform),
      icon: platformIcons[normalized] || '📡',
      label: toReadableLabel(platform),
    }
  })
}

function getLanguageChips(languages) {
  if (!Array.isArray(languages) || languages.length === 0) {
    return []
  }

  return languages.map((language) => {
    const normalized = normalizeValue(language)
    const shortCode = normalized.slice(0, 2)
    return {
      key: normalized || String(language),
      icon: languageFlags[shortCode] || '🌐',
      label: String(language).toUpperCase(),
    }
  })
}

function buildAdsLibraryPageUrl(ad) {
  const baseUrl = 'https://www.facebook.com/ads/library/'
  const params = new URLSearchParams({
    active_status: 'all',
    ad_type: 'all',
    country: 'ALL',
    media_type: 'all',
    search_type: 'page',
  })

  if (ad.page_id) {
    params.set('view_all_page_id', String(ad.page_id))
  }

  return `${baseUrl}?${params.toString()}`
}

function mergeAdsById(previousAds, incomingAds) {
  const byId = new Map(previousAds.map((ad) => [ad.id, ad]))

  for (const ad of incomingAds) {
    byId.set(ad.id, ad)
  }

  return Array.from(byId.values())
}

function App() {
  const [accessToken, setAccessToken] = useState(
    () => getStoredToken() || import.meta.env.VITE_META_ACCESS_TOKEN || '',
  )
  const [searchTerms, setSearchTerms] = useState('')
  const [country, setCountry] = useState('')
  const [adStatus, setAdStatus] = useState('ALL')
  const [startDateFrom, setStartDateFrom] = useState('')
  const [startDateTo, setStartDateTo] = useState('')
  const [checkoutDomainFilter, setCheckoutDomainFilter] = useState('ALL')
  const [minDetectedCopies, setMinDetectedCopies] = useState(1)
  const [detailedMode, setDetailedMode] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [ads, setAds] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [nextPageUrl, setNextPageUrl] = useState('')
  const [currentQuery, setCurrentQuery] = useState(null)

  const canSearch = useMemo(
    () => searchTerms.trim().length > 0 && accessToken.trim().length > 0 && !loading && !loadingMore,
    [searchTerms, accessToken, loading, loadingMore],
  )

  const copiesByFingerprint = useMemo(() => {
    const counts = new Map()

    for (const ad of ads) {
      const fingerprint = buildCreativeFingerprint(ad)
      if (!fingerprint || /^\|*$/.test(fingerprint)) {
        continue
      }

      counts.set(fingerprint, (counts.get(fingerprint) || 0) + 1)
    }

    return counts
  }, [ads])

  const summary = useMemo(() => {
    const values = Array.from(copiesByFingerprint.values())
    const totalGroups = values.length
    const maxCopiesInGroup = values.length > 0 ? Math.max(...values) : 1
    const groupsWithCopies = values.filter((count) => count >= 2).length

    return {
      totalAds: ads.length,
      totalGroups,
      maxCopiesInGroup,
      groupsWithCopies,
    }
  }, [ads, copiesByFingerprint])

  const hostnamesByAdId = useMemo(() => {
    const byId = new Map()
    for (const ad of ads) {
      byId.set(ad.id, collectHostnamesFromAd(ad))
    }
    return byId
  }, [ads])

  const preDomainFilteredAds = useMemo(() => {
    const fromDate = toDateStart(startDateFrom)
    const toDate = toDateEnd(startDateTo)

    return ads
      .filter((ad) => getDetectedCopies(ad, copiesByFingerprint) >= minDetectedCopies)
      .filter((ad) => matchesDateRange(ad, fromDate, toDate))
  }, [ads, copiesByFingerprint, minDetectedCopies, startDateFrom, startDateTo])

  const checkoutDomainOptions = useMemo(() => {
    const options = new Set()
    for (const ad of preDomainFilteredAds) {
      const hostnames = hostnamesByAdId.get(ad.id) || []
      for (const host of hostnames) {
        options.add(host)
      }
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b))
  }, [preDomainFilteredAds, hostnamesByAdId])

  useEffect(() => {
    if (checkoutDomainFilter === 'ALL') {
      return
    }

    if (!checkoutDomainOptions.includes(checkoutDomainFilter)) {
      setCheckoutDomainFilter('ALL')
    }
  }, [checkoutDomainFilter, checkoutDomainOptions])

  const filteredAds = useMemo(() => {
    const checkoutFilterNormalized = normalizeValue(checkoutDomainFilter)

    return preDomainFilteredAds
      .filter((ad) => {
        if (!checkoutFilterNormalized || checkoutFilterNormalized === 'all') {
          return true
        }

        const hostnames = hostnamesByAdId.get(ad.id) || []
        return hostnames.some((host) => host === checkoutFilterNormalized)
      })
  }, [preDomainFilteredAds, checkoutDomainFilter, hostnamesByAdId])

  const handleTokenChange = (event) => {
    const token = event.target.value.trim()
    setAccessToken(token)
    setStoredToken(token)
  }

  const runSearch = async ({ append, queryParams, pageUrl }) => {
    const response = await searchMetaAdsLibrary({
      accessToken,
      nextPageUrl: pageUrl,
      searchTerms: queryParams.searchTerms,
      reachedCountry: queryParams.country,
      adActiveStatus: queryParams.adStatus,
      startDateFrom: queryParams.startDateFrom,
      startDateTo: queryParams.startDateTo,
      detailed: queryParams.detailedMode,
    })

    const incomingAds = response.data ?? []
    setAds((prev) => (append ? mergeAdsById(prev, incomingAds) : incomingAds))
    setHasMore(Boolean(response.meta?.hasMore))
    setNextPageUrl(response.meta?.nextPageUrl || '')

    if (response.meta?.warning) {
      setInfo(response.meta.warning)
    } else if (response.meta?.fieldMode) {
      const fieldsCount = response.meta.requestedFields?.length || 0
      setInfo(`Consulta completada en modo ${response.meta.fieldMode}. Campos solicitados: ${fieldsCount}.`) 
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    const queryParams = {
      searchTerms,
      country: country.trim().toUpperCase() || 'ALL',
      adStatus,
      startDateFrom,
      startDateTo,
      detailedMode,
    }

    setCurrentQuery(queryParams)

    try {
      await runSearch({ append: false, queryParams, pageUrl: '' })
    } catch (err) {
      setError(err.message || 'No fue posible consultar la API de Meta.')
      setAds([])
      setHasMore(false)
      setNextPageUrl('')
    } finally {
      setLoading(false)
    }
  }

  const handleLoadMore = async () => {
    if (!hasMore || !nextPageUrl || !currentQuery) {
      return
    }

    setLoadingMore(true)
    setError('')

    try {
      await runSearch({ append: true, queryParams: currentQuery, pageUrl: nextPageUrl })
    } catch (err) {
      setError(err.message || 'No fue posible cargar la siguiente página.')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <main className="container">
      <h1>MetaSpy</h1>
      <p className="subtitle">Consulta anuncios de la librería de Meta Ads (Ad Library API).</p>

      <form className="card search-form" onSubmit={handleSubmit}>
        <label>
          Access Token (Meta Graph API)
          <input
            value={accessToken}
            onChange={handleTokenChange}
            placeholder="Pega aquí tu token"
          />
        </label>

        <label>
          Palabras de búsqueda
          <input
            value={searchTerms}
            onChange={(event) => setSearchTerms(event.target.value)}
            placeholder="Ej. seguros de auto"
          />
        </label>

        <label>
          País (ISO 2)
          <input
            value={country}
            onChange={(event) => setCountry(event.target.value.toUpperCase())}
            maxLength={2}
            placeholder="ALL"
          />
        </label>

        <label>
          Estado del anuncio
          <select value={adStatus} onChange={(event) => setAdStatus(event.target.value)}>
            <option value="ALL">Todos</option>
            <option value="ACTIVE">Activos</option>
            <option value="INACTIVE">Inactivos</option>
          </select>
        </label>

        <label>
          Fecha inicio hasta (opcional)
          <input
            type="date"
            value={startDateTo}
            onChange={(event) => setStartDateTo(event.target.value)}
          />
        </label>

        <label>
          Fecha inicio desde (opcional)
          <input
            type="date"
            value={startDateFrom}
            onChange={(event) => setStartDateFrom(event.target.value)}
          />
        </label>

        <label>
          Dominio detectado (opcional)
          <select
            value={checkoutDomainFilter}
            onChange={(event) => setCheckoutDomainFilter(event.target.value)}
            disabled={checkoutDomainOptions.length === 0}
          >
            <option value="ALL">Todos</option>
            {checkoutDomainOptions.map((domain) => (
              <option key={domain} value={domain}>
                {domain}
              </option>
            ))}
          </select>
        </label>

        <label>
          Mínimo de copias detectadas
          <input
            type="number"
            value={minDetectedCopies}
            min={1}
            onChange={(event) => setMinDetectedCopies(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>

        <label className="inline-checkbox">
          <input
            type="checkbox"
            checked={detailedMode}
            onChange={(event) => setDetailedMode(event.target.checked)}
          />
          Obtener máximo detalle posible
        </label>

        <button disabled={!canSearch} type="submit">
          {loading ? 'Consultando...' : 'Buscar anuncios'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {info && <p className="info">{info}</p>}

      <section>
        <h2>Resultados</h2>
        <p className="info">
          {`Total anuncios: ${summary.totalAds} | Grupos creativos detectados: ${summary.totalGroups} | Grupos con copias (>=2): ${summary.groupsWithCopies} | Máximo copias en un grupo: ${summary.maxCopiesInGroup}`}
        </p>

        {ads.length > 0 && (
          <p className="info">
            {`Filtro activo: copias >= ${minDetectedCopies}${startDateFrom ? ` | desde ${startDateFrom}` : ''}${startDateTo ? ` | hasta ${startDateTo}` : ''}${checkoutDomainFilter !== 'ALL' ? ` | dominio ${checkoutDomainFilter}` : ''}.`}
          </p>
        )}

        {filteredAds.length === 0 ? (
          <p className="empty">No hay anuncios para mostrar.</p>
        ) : (
          <>
            <ul className="results">
              {filteredAds.map((ad) => (
              (() => {
                const statusInfo = getStatusInfo(ad)
                const detectedCopies = getDetectedCopies(ad, copiesByFingerprint)
                const platformChips = getPlatformChips(ad.publisher_platforms)
                const languageChips = getLanguageChips(ad.languages)
                return (
              <li key={ad.id}>
                <div className="ad-top-row">
                  <div className={`ad-status-badge ${statusInfo.className}`}>
                    {statusInfo.label}
                  </div>
                  <div className={`ad-copies-badge ${getCopiesBadgeClass(detectedCopies)}`}>
                    Copias: {detectedCopies}
                  </div>
                </div>
                <h3 className="ad-title">
                  <a
                    href={buildAdsLibraryPageUrl(ad)}
                    target="_blank"
                    rel="noreferrer"
                    className="ad-page-link"
                  >
                    {ad.page_name || 'Sin nombre de página'}
                  </a>
                </h3>
                <div className="ad-meta-grid">
                  <p><span>ID:</span> {ad.id}</p>
                  <p><span>Page ID:</span> {ad.page_id || 'N/D'}</p>
                  <p>
                    <span>Fecha inicio:</span>{' '}
                    {ad.ad_delivery_start_time || ad.ad_creation_time
                      ? new Date(ad.ad_delivery_start_time || ad.ad_creation_time).toLocaleString('es-CO')
                      : 'N/D'}
                  </p>
                  <p><span>Duración:</span> {getCampaignDurationText(ad)}</p>
                  <p><span>Estado:</span> {ad.ad_delivery_stop_time ? 'Finalizado' : 'Activo/indeterminado'}</p>
                  <div className="ad-chip-group">
                    <span>Plataformas:</span>
                    {platformChips.length > 0 ? (
                      <div className="ad-chip-list">
                        {platformChips.map((item) => (
                          <span key={item.key} className="ad-chip">
                            {item.icon} {item.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p>N/D</p>
                    )}
                  </div>
                  <div className="ad-chip-group">
                    <span>Idiomas:</span>
                    {languageChips.length > 0 ? (
                      <div className="ad-chip-list">
                        {languageChips.map((item) => (
                          <span key={item.key} className="ad-chip">
                            {item.icon} {item.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p>N/D</p>
                    )}
                  </div>
                </div>
                <p className="ad-hosts">
                  <span>Dominios:</span> {(hostnamesByAdId.get(ad.id) || []).slice(0, 4).join(', ') || 'N/D'}
                </p>
                <a href={ad.ad_snapshot_url} target="_blank" rel="noreferrer" className="ad-snapshot-btn">
                  Ver snapshot
                </a>
              </li>
                )
              })()
              ))}
            </ul>

            {hasMore && (
              <div className="load-more-wrap">
                <button type="button" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? 'Cargando más...' : 'Cargar más'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

export default App