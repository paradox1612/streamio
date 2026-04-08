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
    val type: String,           // "Movie" | "TvSeries" | "Live"
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
 * Bridges CloudStream to a StreamBridge backend instance.
 * The user provides their addon token (from StreamBridge dashboard →
 * "Your Addon URL") in the plugin settings dialog.
 *
 * All content logic lives in the backend — this class is a thin HTTP client.
 */
class StreamBridgeProvider(private val plugin: StreamBridgePlugin) : MainAPI() {

    override var name = "StreamBridge"
    override var lang = "en"

    override val hasMainPage = true
    override val hasQuickSearch = false
    override val supportedTypes = setOf(TvType.Movie, TvType.TvSeries, TvType.Live)

    // ── Settings helpers ──────────────────────────────────────────────────────

    private fun getToken(): String? = plugin.settingsManager.getString("addon_token", null)

    private fun getBaseUrl(): String =
        plugin.settingsManager.getString("base_url", null)
            ?.trimEnd('/')
            ?: "https://api.streambridge.io"

    private fun apiUrl(path: String) = "${getBaseUrl()}$path"

    // ── Homepage sections ─────────────────────────────────────────────────────

    /**
     * mainPage defines the tabs/sections shown on the CloudStream home screen.
     * Each entry becomes one paginated call to getMainPage().
     * We expose Movies, Series, and Live TV as three separate tabs.
     */
    override val mainPage = mainPageOf(
        "Movie"    to "Movies",
        "TvSeries" to "Series",
        "Live"     to "Live TV",
    )

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse? {
        val token = getToken() ?: return null
        val csType = request.data  // "Movie" | "TvSeries" | "Live"

        val url = apiUrl("/cloudstream/catalog?token=$token&type=$csType&page=$page&pageSize=50")
        val response = app.get(url)
        if (!response.isSuccessful) return null

        val data = parseJson<CSCatalogResponse>(response.text)
        val items = data.results.mapNotNull { it.toSearchResponse() }

        return newHomePageResponse(request.name, items, data.hasNextPage)
    }

    // ── Search ────────────────────────────────────────────────────────────────

    override suspend fun search(query: String): List<SearchResponse>? {
        val token = getToken() ?: return null
        val encoded = java.net.URLEncoder.encode(query, "UTF-8")

        val url = apiUrl("/cloudstream/search?token=$token&query=$encoded&pageSize=50")
        val response = app.get(url)
        if (!response.isSuccessful) return null

        val data = parseJson<CSCatalogResponse>(response.text)
        return data.results.mapNotNull { it.toSearchResponse() }
    }

    // ── Detail / Load ─────────────────────────────────────────────────────────

    /**
     * Called when the user taps a title.
     * Fetches full detail including episode list for series.
     */
    override suspend fun load(url: String): LoadResponse? {
        val token = getToken() ?: return null

        // url is the content ID: "tt1234567", "tmdb:123", or "sb_uuid"
        // type is embedded in the SearchResponse data — recover it from the
        // detail endpoint which echoes it back.
        val encoded = java.net.URLEncoder.encode(url, "UTF-8")

        // We do not know the type yet at this point; the backend can infer it
        // from the ID. Pass a broad default and let the backend handle it.
        val type = inferTypeFromUrl(url)
        val apiEndpoint = apiUrl(
            "/cloudstream/detail?token=$token&url=$encoded&type=$type"
        )

        val response = app.get(apiEndpoint)
        if (!response.isSuccessful) return null

        val detail = parseJson<CSDetailResponse>(response.text)

        return when (detail.type) {
            "TvSeries" -> {
                val episodes = detail.episodes?.map { ep ->
                    Episode(
                        data = ep.url,           // "baseId:season:episode"
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

            else -> { // "Movie" and anything else
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

    /**
     * Called when the user picks a title (movie/live) or episode (series).
     * `data` is the content ID for movies and the episode ID for series.
     *
     * Returns one ExtractorLink per backend host — CloudStream lists them so
     * the user can manually switch hosts if one is slow or offline.
     */
    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit,
    ): Boolean {
        val token = getToken() ?: return false

        val encoded = java.net.URLEncoder.encode(data, "UTF-8")
        val type = inferTypeFromUrl(data)
        val url = apiUrl("/cloudstream/stream?token=$token&url=$encoded&type=$type")

        val response = app.get(url)
        if (!response.isSuccessful) return false

        val streamResponse = parseJson<CSStreamResponse>(response.text)
        if (streamResponse.streams.isEmpty()) return false

        streamResponse.streams.forEach { stream ->
            val isM3u8 = stream.url.contains(".m3u8", ignoreCase = true)
                    || type == "Live"

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

    /**
     * Convert a CSItem to the appropriate SearchResponse subtype.
     */
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

    /**
     * Infer the CloudStream type string from a content URL/ID.
     * Series episode IDs contain ":" separators (baseId:season:episode).
     * Live stream IDs from the backend start with "live_".
     * Everything else defaults to Movie.
     */
    private fun inferTypeFromUrl(url: String): String {
        if (url.startsWith("live_")) return "Live"
        // A series episode ID looks like "tt123:1:1" or "sb_uuid:1:1"
        val parts = url.split(":")
        return when {
            parts.size >= 3 && parts.last().all { it.isDigit() } -> "TvSeries"
            else -> "Movie"
        }
    }

    /**
     * Build the human-readable label shown next to each stream in the player.
     */
    private fun buildStreamLabel(stream: CSStream): String {
        val label = stream.name.ifBlank { "StreamBridge" }
        return if (!stream.quality.isNullOrBlank()) "$label (${stream.quality})" else label
    }
}
