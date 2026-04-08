package com.streambridge.cloudstream

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.AppUtils.parseJson
import com.lagradost.cloudstream3.utils.ExtractorLink
import com.lagradost.cloudstream3.utils.ExtractorLinkType
import com.lagradost.cloudstream3.utils.newExtractorLink

// ─── JSON Data Classes ────────────────────────────────────────────────────────

@JsonIgnoreProperties(ignoreUnknown = true)
data class CSProvider(val id: String, val name: String)

@JsonIgnoreProperties(ignoreUnknown = true)
data class CSProvidersResponse(val providers: List<CSProvider> = emptyList())

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

    override var name = "StreamBridge"
    override var lang = "en"

    override val hasMainPage = true

    // Enables the instant suggestion dropdown as the user types in the search bar
    override val hasQuickSearch = true

    override val supportedTypes = setOf(TvType.Movie, TvType.TvSeries, TvType.Live)

    // ── Settings helpers ──────────────────────────────────────────────────────

    private fun getToken(): String? = plugin.settingsManager.getString("addon_token", null)

    private fun getBaseUrl(): String =
        plugin.settingsManager.getString("base_url", null)
            ?.trimEnd('/')
            ?: "https://api.streambridge.io"

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
    override val mainPage: List<MainPageData> by lazy {
        val token = getToken()

        // No token set yet — show placeholder rows
        if (token.isNullOrBlank()) {
            return@lazy listOf(
                MainPageData("Movies",   "Movie|all",    false),
                MainPageData("Series",   "TvSeries|all", false),
                MainPageData("Live TV",  "Live|all",     false),
            )
        }

        try {
            // Fetch providers synchronously (this runs once at plugin init)
            val url = apiUrl("/cloudstream/providers?token=$token")
            val response = kotlinx.coroutines.runBlocking { app.get(url) }
            val data = parseJson<CSProvidersResponse>(response.text)

            if (data.providers.isEmpty()) {
                return@lazy listOf(
                    MainPageData("Movies",  "Movie|all",    false),
                    MainPageData("Series",  "TvSeries|all", false),
                    MainPageData("Live TV", "Live|all",     false),
                )
            }

            // One row per type per provider
            data.providers.flatMap { provider ->
                listOf(
                    MainPageData("${provider.name} – Movies",   "Movie|${provider.id}",    false),
                    MainPageData("${provider.name} – Series",   "TvSeries|${provider.id}", false),
                    MainPageData("${provider.name} – Live TV",  "Live|${provider.id}",     false),
                )
            }
        } catch (e: Exception) {
            // Network failure at init — fall back to generic rows
            listOf(
                MainPageData("Movies",   "Movie|all",    false),
                MainPageData("Series",   "TvSeries|all", false),
                MainPageData("Live TV",  "Live|all",     false),
            )
        }
    }

    /**
     * Fetches one page of content for a homepage section.
     *
     * request.data format: "TYPE|PROVIDER_ID"
     *   e.g. "Movie|3f8a1c…"  or  "Live|all"
     */
    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse? {
        val token = getToken() ?: return null

        val parts = request.data.split("|", limit = 2)
        val csType    = parts.getOrElse(0) { "Movie" }
        val providerId = parts.getOrElse(1) { "all" }

        val providerParam = if (providerId != "all") "&providerId=$providerId" else ""
        val url = apiUrl(
            "/cloudstream/catalog?token=$token&type=$csType&page=$page&pageSize=50$providerParam"
        )

        val response = app.get(url)
        if (!response.isSuccessful) return null

        val data = parseJson<CSCatalogResponse>(response.text)
        val items = data.results.mapNotNull { it.toSearchResponse() }

        return newHomePageResponse(request.name, items, data.hasNextPage)
    }

    // ── Full search ───────────────────────────────────────────────────────────

    /**
     * Full search — called when the user submits a search query.
     * Searches across all providers on the backend and returns merged results.
     */
    override suspend fun search(query: String): List<SearchResponse>? {
        val token = getToken() ?: return null
        val encoded = java.net.URLEncoder.encode(query, "UTF-8")

        val response = app.get(apiUrl("/cloudstream/search?token=$token&query=$encoded&pageSize=50"))
        if (!response.isSuccessful) return null

        return parseJson<CSCatalogResponse>(response.text).results.mapNotNull { it.toSearchResponse() }
    }

    /**
     * Quick search — fires as the user types, showing instant suggestions.
     * Uses a smaller page size (20) for speed.
     * Searches all content types so suggestions aren't limited to one category.
     */
    override suspend fun quickSearch(query: String): List<SearchResponse>? {
        val token = getToken() ?: return null
        if (query.length < 2) return null   // wait for at least 2 chars

        val encoded = java.net.URLEncoder.encode(query, "UTF-8")

        val response = app.get(apiUrl("/cloudstream/search?token=$token&query=$encoded&pageSize=20"))
        if (!response.isSuccessful) return null

        return parseJson<CSCatalogResponse>(response.text).results.mapNotNull { it.toSearchResponse() }
    }

    // ── Detail / Load ─────────────────────────────────────────────────────────

    override suspend fun load(url: String): LoadResponse? {
        val token = getToken() ?: return null
        val encoded = java.net.URLEncoder.encode(url, "UTF-8")
        val type = inferTypeFromUrl(url)

        val response = app.get(apiUrl("/cloudstream/detail?token=$token&url=$encoded&type=$type"))
        if (!response.isSuccessful) return null

        val detail = parseJson<CSDetailResponse>(response.text)

        return when (detail.type) {
            "TvSeries" -> {
                val episodes = detail.episodes?.map { ep ->
                    Episode(
                        data = ep.url,
                        name = ep.name,
                        season = ep.season,
                        episode = ep.episode,
                        posterUrl = ep.posterUrl,
                        description = ep.plot,
                    )
                } ?: emptyList()

                newTvSeriesLoadResponse(
                    name = detail.name,
                    url = detail.url,
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
                newLiveStreamLoadResponse(
                    name = detail.name,
                    url = detail.url,
                    type = TvType.Live,
                    dataUrl = detail.url,
                ) {
                    this.posterUrl = detail.posterUrl
                    this.plot = detail.plot
                    this.tags = detail.tags
                }
            }

            else -> {
                newMovieLoadResponse(
                    name = detail.name,
                    url = detail.url,
                    type = TvType.Movie,
                    dataUrl = detail.url,
                ) {
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
        val token = getToken() ?: return false
        val encoded = java.net.URLEncoder.encode(data, "UTF-8")
        val type = inferTypeFromUrl(data)

        val response = app.get(apiUrl("/cloudstream/stream?token=$token&url=$encoded&type=$type"))
        if (!response.isSuccessful) return false

        val streamResponse = parseJson<CSStreamResponse>(response.text)
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

    private fun CSItem.toSearchResponse(): SearchResponse? {
        if (name.isBlank() || url.isBlank()) return null
        return when (type) {
            "TvSeries" -> newTvSeriesSearchResponse(name, url, TvType.TvSeries) {
                this.posterUrl = this@toSearchResponse.posterUrl
            }
            "Live" -> newLiveSearchResponse(name, url, TvType.Live) {
                this.posterUrl = this@toSearchResponse.posterUrl
            }
            else -> newMovieSearchResponse(name, url, TvType.Movie) {
                this.posterUrl = this@toSearchResponse.posterUrl
            }
        }
    }

    private fun inferTypeFromUrl(url: String): String {
        if (url.startsWith("live_")) return "Live"
        val parts = url.split(":")
        return when {
            parts.size >= 3 && parts.last().all { it.isDigit() } -> "TvSeries"
            else -> "Movie"
        }
    }

    private fun buildStreamLabel(stream: CSStream): String {
        val label = stream.name.ifBlank { "StreamBridge" }
        return if (!stream.quality.isNullOrBlank()) "$label (${stream.quality})" else label
    }
}
