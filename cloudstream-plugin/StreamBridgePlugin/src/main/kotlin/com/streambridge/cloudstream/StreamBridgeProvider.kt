package com.streambridge.cloudstream

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.app
import com.lagradost.cloudstream3.utils.AppUtils.parseJson
import com.lagradost.cloudstream3.utils.ExtractorLink
import com.lagradost.cloudstream3.utils.ExtractorLinkType
import com.lagradost.cloudstream3.utils.Qualities
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
    private val setupUrl = "streambridge://setup"

    override var name = "StreamBridge"
    override var lang = "en"

    override val hasMainPage = true

    // Enables the instant suggestion dropdown as the user types in the search bar
    override val hasQuickSearch = true

    override val supportedTypes = setOf(TvType.Movie, TvType.TvSeries, TvType.Live)

    // ── Settings helpers ──────────────────────────────────────────────────────

    private fun getToken(): String? = plugin.getSetting("addon_token")

    private fun getBaseUrl(): String =
        plugin.getSetting("base_url")
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
    override val mainPage: List<MainPageData> = listOf(
        MainPageData("Movies", "Movie|all", false),
        MainPageData("Series", "TvSeries|all", false),
        MainPageData("Live TV", "Live|all", false),
    )

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

        val parts = request.data.split("|", limit = 2)
        val csType    = parts.getOrElse(0) { "Movie" }
        val providerId = parts.getOrElse(1) { "all" }

        val providerParam = if (providerId != "all") "&providerId=$providerId" else ""
        val url = apiUrl(
            "/cloudstream/catalog?token=$token&type=$csType&page=$page&pageSize=50$providerParam"
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
                this.plot =
                    "Open plugin settings and paste either your StreamBridge addon token " +
                    "or the full addon URL from your dashboard."
            }
        }

        val token = getToken() ?: return null
        val encoded = java.net.URLEncoder.encode(url, "UTF-8")
        val type = inferTypeFromUrl(url)

        val body = fetchText(apiUrl("/cloudstream/detail?token=$token&url=$encoded&type=$type"))
            ?: return null
        val detail = runCatching { parseJson<CSDetailResponse>(body) }.getOrNull() ?: return null

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
                newLiveStreamLoadResponse(detail.name, detail.url, detail.url) {
                    this.posterUrl = detail.posterUrl
                    this.plot = detail.plot
                    this.tags = detail.tags
                }
            }

            else -> {
                newMovieLoadResponse(detail.name, detail.url, TvType.Movie, detail.url) {
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
        val encoded = java.net.URLEncoder.encode(data, "UTF-8")
        val type = inferTypeFromUrl(data)

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

    private fun buildSetupCard(): SearchResponse {
        return newMovieSearchResponse("Configure StreamBridge", setupUrl, TvType.Movie) {
            this.posterUrl = null
        }
    }

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
