package com.streambridge.cloudstream

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.app
import com.lagradost.cloudstream3.utils.AppUtils.parseJson
import com.lagradost.cloudstream3.utils.ExtractorLink
import com.lagradost.cloudstream3.utils.ExtractorLinkType
import com.lagradost.cloudstream3.utils.Qualities
import com.lagradost.cloudstream3.utils.newExtractorLink
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

// ─── JSON Data Classes ────────────────────────────────────────────────────────

@JsonIgnoreProperties(ignoreUnknown = true)
data class CSProvider(val id: String, val name: String)

@JsonIgnoreProperties(ignoreUnknown = true)
data class CSProvidersResponse(val providers: List<CSProvider> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
data class CSSection(
    val id: String,
    val title: String,
    val type: String,
    val providerId: String,
    val category: String,
    val count: Int,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class CSSectionsResponse(val sections: List<CSSection> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
data class CSItem(
    val name: String,
    val url: String,
    val posterUrl: String?,
    val type: String,
    val year: Int?,
    val tags: List<String> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class CSCatalogResponse(
    val results: List<CSItem> = emptyList(),
    val hasNextPage: Boolean = false,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class CSEpisode(
    val name: String,
    val season: Int,
    val episode: Int,
    val url: String,
    val posterUrl: String?,
    val plot: String?,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class CSDetailResponse(
    val name: String,
    val url: String,
    val posterUrl: String?,
    val type: String,
    val year: Int?,
    val plot: String?,
    val tags: List<String> = emptyList(),
    val episodes: List<CSEpisode>?,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class CSStream(
    val url: String,
    val name: String,
    val quality: String?,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class CSStreamResponse(val streams: List<CSStream> = emptyList())

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * StreamBridgeProvider
 *
 * Main page sections are built dynamically from the user's providers:
 *
 *   Provider A – Movies  │  fetched from /cloudstream/catalog?providerId=A&type=Movie
 *   Provider A – Series  │  fetched from /cloudstream/catalog?providerId=A&type=TvSeries
 *   Provider A – Live    │  fetched from /cloudstream/catalog?providerId=A&type=Live
 *   Provider B – Movies  │  ...
 *   ...
 *
 * The MainPageData.data field encodes "TYPE|PROVIDER_ID" so getMainPage() knows
 * exactly which provider and type to fetch without any extra state.
 *
 * Quick search is enabled so CloudStream shows instant suggestions as the user
 * types — backed by /cloudstream/search on the backend.
 */
class StreamBridgeProvider(private val plugin: StreamBridgePlugin) : MainAPI() {
    private val setupUrl = "streambridge://setup"
    private val mainPageTtlMs = 5 * 60 * 1000L
    private val defaultMainPage = listOf(
        MainPageData("Movies", encodeSectionData("Movie", "all", null), false),
        MainPageData("Series", encodeSectionData("TvSeries", "all", null), false),
        MainPageData("Live TV", encodeSectionData("Live", "all", null), false),
    )
    @Volatile
    private var cachedMainPage: List<MainPageData>? = null
    @Volatile
    private var cachedMainPageAt: Long = 0L

    override var name = "StreamBridge"
    override var lang = "en"

    override val hasMainPage = true

    // Enables the instant suggestion dropdown as the user types in the search bar
    override val hasQuickSearch = true

    override val supportedTypes = setOf(TvType.Movie, TvType.TvSeries, TvType.Live)

    // ── Settings helpers ──────────────────────────────────────────────────────

    private fun getToken(): String? = plugin.getSetting("addon_token")

    private fun getBaseUrl(): String {
        val override = plugin.getSetting("base_url")?.trim()?.trimEnd('/')
        if (!override.isNullOrBlank()) return override
        return BuildConfig.DEFAULT_BASE_URL.trimEnd('/')
    }

    private fun apiUrl(path: String) = "${getBaseUrl()}$path"

    // ── Dynamic main page ─────────────────────────────────────────────────────

    /**
     * mainPage is built lazily on first access.
     *
     * Each IPTV provider the user has added gets three rows:
     *   "{Provider Name} – Movies"
     *   "{Provider Name} – Series"
     *   "{Provider Name} – Live TV"
     *
     * If the token isn't set yet or the fetch fails, fall back to three generic
     * rows that aggregate content across all providers (providerId = "all").
     *
     * The data field encodes "TYPE|PROVIDER_ID" — parsed in getMainPage().
     */
    override val mainPage: List<MainPageData>
        get() = buildMainPageSections()

    /**
     * Fetches one page of content for a homepage section.
     *
     * request.data format: "TYPE|PROVIDER_ID"
     *   e.g. "Movie|3f8a1c…"  or  "Live|all"
     */
    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse? {
        val token = getToken()
        if (token.isNullOrBlank()) {
            return newHomePageResponse(request.name, listOf(buildSetupCard()), false)
        }

        val section = decodeSectionData(request.data)
        val csType = section.type
        val providerId = section.providerId
        val categoryParam = section.category?.takeIf { it.isNotBlank() }
            ?.let { "&category=${URLEncoder.encode(it, "UTF-8")}" }
            ?: ""

        val providerParam = if (providerId != "all") "&providerId=$providerId" else ""
        val url = apiUrl(
            "/cloudstream/catalog?token=$token&type=$csType&page=$page&pageSize=50$providerParam$categoryParam"
        )

        val body = fetchText(url) ?: return newHomePageResponse(request.name, emptyList(), false)
        val data = runCatching { parseJson<CSCatalogResponse>(body) }
            .getOrElse { return newHomePageResponse(request.name, emptyList(), false) }

        val items = data.results.mapNotNull { it.toSearchResponse() }

        return newHomePageResponse(request.name, items, data.hasNextPage)
    }

    // ── Full search ───────────────────────────────────────────────────────────

    /**
     * Full search — called when the user submits a search query.
     * Searches across all providers on the backend and returns merged results.
     */
    override suspend fun search(query: String): List<SearchResponse>? {
        val token = getToken() ?: return listOf(buildSetupCard())
        val encoded = java.net.URLEncoder.encode(query, "UTF-8")

        val body = fetchText(apiUrl("/cloudstream/search?token=$token&query=$encoded&pageSize=50"))
            ?: return emptyList()

        return runCatching { parseJson<CSCatalogResponse>(body) }
            .getOrNull()
            ?.results
            ?.mapNotNull { it.toSearchResponse() }
            ?: emptyList()
    }

    /**
     * Quick search — fires as the user types, showing instant suggestions.
     * Uses a smaller page size (20) for speed.
     * Searches all content types so suggestions aren't limited to one category.
     */
    override suspend fun quickSearch(query: String): List<SearchResponse>? {
        val token = getToken() ?: return listOf(buildSetupCard())
        if (query.length < 2) return null   // wait for at least 2 chars

        val encoded = java.net.URLEncoder.encode(query, "UTF-8")

        val body = fetchText(apiUrl("/cloudstream/search?token=$token&query=$encoded&pageSize=20"))
            ?: return emptyList()

        return runCatching { parseJson<CSCatalogResponse>(body) }
            .getOrNull()
            ?.results
            ?.mapNotNull { it.toSearchResponse() }
            ?: emptyList()
    }

    // ── Detail / Load ─────────────────────────────────────────────────────────

    override suspend fun load(url: String): LoadResponse? {
        if (url == setupUrl) {
            return newMovieLoadResponse(
                "StreamBridge setup required",
                setupUrl,
                TvType.Movie,
                setupUrl,
            ) {
                this.plot = """
                    StreamBridge is not configured yet.

                    1. Go back to the Extensions screen
                    2. Tap the ⚙️  gear icon next to "StreamBridge"
                    3. Paste your addon token from the StreamBridge dashboard
                       (either the token alone or the full addon URL)
                    4. Save — the Home tab will then load your library

                    Backend: ${getBaseUrl()}
                """.trimIndent()
            }
        }

        val token = getToken() ?: return null
        val (itemUrl, type) = decodeItemData(url)
        val encoded = java.net.URLEncoder.encode(itemUrl, "UTF-8")

        val body = fetchText(apiUrl("/cloudstream/detail?token=$token&url=$encoded&type=$type"))
            ?: return null
        val detail = runCatching { parseJson<CSDetailResponse>(body) }.getOrNull() ?: return null
        val responseData = encodeItemData(detail.type, detail.url)

        return when (detail.type) {
            "TvSeries" -> {
                val episodes = detail.episodes?.map { ep ->
                    newEpisode(ep.url) {
                        this.name = ep.name
                        this.season = ep.season
                        this.episode = ep.episode
                        this.posterUrl = ep.posterUrl
                        this.description = ep.plot
                    }
                } ?: emptyList()

                newTvSeriesLoadResponse(
                    name = detail.name,
                    url = responseData,
                    type = TvType.TvSeries,
                    episodes = episodes,
                ) {
                    this.posterUrl = detail.posterUrl
                    this.year = detail.year
                    this.plot = detail.plot
                    this.tags = detail.tags
                }
            }

            "Live" -> {
                newLiveStreamLoadResponse(detail.name, responseData, responseData) {
                    this.posterUrl = detail.posterUrl
                    this.plot = detail.plot
                    this.tags = detail.tags
                }
            }

            else -> {
                newMovieLoadResponse(detail.name, responseData, TvType.Movie, responseData) {
                    this.posterUrl = detail.posterUrl
                    this.year = detail.year
                    this.plot = detail.plot
                    this.tags = detail.tags
                }
            }
        }
    }

    // ── Stream extraction ─────────────────────────────────────────────────────

    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit,
    ): Boolean {
        if (data == setupUrl) return false

        val token = getToken() ?: return false
        val (itemUrl, type) = decodeItemData(data)
        val encoded = java.net.URLEncoder.encode(itemUrl, "UTF-8")

        val body = fetchText(apiUrl("/cloudstream/stream?token=$token&url=$encoded&type=$type"))
            ?: return false
        val streamResponse = runCatching { parseJson<CSStreamResponse>(body) }.getOrNull() ?: return false
        if (streamResponse.streams.isEmpty()) return false

        streamResponse.streams.forEach { stream ->
            val isM3u8 = stream.url.contains(".m3u8", ignoreCase = true) || type == "Live"
            callback(
                newExtractorLink(
                    source = "StreamBridge",
                    name = buildStreamLabel(stream),
                    url = stream.url,
                ) {
                    this.referer = getBaseUrl()
                    this.quality = Qualities.Unknown.value
                    this.type = if (isM3u8) ExtractorLinkType.M3U8 else ExtractorLinkType.VIDEO
                }
            )
        }

        return true
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private suspend fun fetchText(url: String): String? {
        return runCatching {
            val response = app.get(url)
            if (response.isSuccessful) response.text else null
        }.getOrNull()
    }

    private fun fetchTextBlocking(url: String): String? {
        return runCatching {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("Accept", "application/json")

            try {
                if (conn.responseCode !in 200..299) return null
                conn.inputStream.bufferedReader().use { it.readText() }
            } finally {
                conn.disconnect()
            }
        }.getOrNull()
    }

    private fun buildSetupCard(): SearchResponse {
        return newMovieSearchResponse("⚙️  Tap to configure StreamBridge", setupUrl, TvType.Movie) {
            this.posterUrl =
                "https://raw.githubusercontent.com/paradox1612/streamio/main/cloudstream-plugin/icon.png"
        }
    }

    private fun CSItem.toSearchResponse(): SearchResponse? {
        if (name.isBlank() || url.isBlank()) return null
        return when (type) {
            "TvSeries" -> newTvSeriesSearchResponse(name, encodeItemData("TvSeries", url), TvType.TvSeries) {
                this.posterUrl = this@toSearchResponse.posterUrl
            }
            "Live" -> newLiveSearchResponse(name, encodeItemData("Live", url), TvType.Live) {
                this.posterUrl = this@toSearchResponse.posterUrl
            }
            else -> newMovieSearchResponse(name, encodeItemData("Movie", url), TvType.Movie) {
                this.posterUrl = this@toSearchResponse.posterUrl
            }
        }
    }

    private fun buildMainPageSections(): List<MainPageData> {
        val token = getToken() ?: return defaultMainPage
        val now = System.currentTimeMillis()
        val cached = cachedMainPage
        if (cached != null && now - cachedMainPageAt < mainPageTtlMs) return cached

        val providersBody = fetchTextBlocking(apiUrl("/cloudstream/providers?token=${URLEncoder.encode(token, "UTF-8")}"))
            ?: return cached ?: defaultMainPage
        val providers = runCatching { parseJson<CSProvidersResponse>(providersBody).providers }
            .getOrNull()
            ?.filter { it.id.isNotBlank() }
            ?: return cached ?: defaultMainPage

        val sections = mutableListOf<MainPageData>()
        providers.forEach { provider ->
            val body = fetchTextBlocking(
                apiUrl("/cloudstream/sections?token=${URLEncoder.encode(token, "UTF-8")}&providerId=${URLEncoder.encode(provider.id, "UTF-8")}&perTypeLimit=6")
            ) ?: return@forEach

            val providerSections = runCatching { parseJson<CSSectionsResponse>(body).sections }.getOrNull().orEmpty()
            providerSections.forEach { section ->
                val label = "${provider.name} - ${section.title}"
                sections += MainPageData(
                    label,
                    encodeSectionData(section.type, section.providerId, section.category),
                    false,
                )
            }
        }

        val resolved = if (sections.isNotEmpty()) sections else defaultMainPage
        cachedMainPage = resolved
        cachedMainPageAt = now
        return resolved
    }

    private data class DecodedSection(
        val type: String,
        val providerId: String,
        val category: String?,
    )

    private fun encodeSectionData(type: String, providerId: String, category: String?): String {
        val encodedCategory = category?.let { URLEncoder.encode(it, "UTF-8") } ?: ""
        return "$type|$providerId|$encodedCategory"
    }

    private fun decodeSectionData(data: String): DecodedSection {
        val parts = data.split("|", limit = 3)
        val type = parts.getOrElse(0) { "Movie" }.ifBlank { "Movie" }
        val providerId = parts.getOrElse(1) { "all" }.ifBlank { "all" }
        val category = parts.getOrNull(2)
            ?.takeIf { it.isNotBlank() }
            ?.let { java.net.URLDecoder.decode(it, "UTF-8") }
        return DecodedSection(type, providerId, category)
    }

    private fun encodeItemData(type: String, url: String): String {
        return "$type|$url"
    }

    private fun decodeItemData(data: String): Pair<String, String> {
        val parts = data.split("|", limit = 2)
        if (parts.size == 2 && parts[0].isNotBlank() && parts[1].isNotBlank()) {
            return parts[1] to parts[0]
        }

        if (data.startsWith("live_")) return data to "Live"
        val urlParts = data.split(":")
        return when {
            urlParts.size >= 3 && urlParts.last().all { it.isDigit() } -> data to "TvSeries"
            else -> data to "Movie"
        }
    }

    private fun buildStreamLabel(stream: CSStream): String {
        val label = stream.name.ifBlank { "StreamBridge" }
        return if (!stream.quality.isNullOrBlank()) "$label (${stream.quality})" else label
    }
}
