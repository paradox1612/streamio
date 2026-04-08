// StreamBridge CloudStream Plugin
// Build with: ./gradlew StreamBridgePlugin:make
// Deploy:     ./gradlew StreamBridgePlugin:deployWithAdb

version = 1

cloudstream {
    // Shown in the CloudStream extension browser
    description = "Access your StreamBridge IPTV library in CloudStream. " +
            "Sign in with your StreamBridge addon token to browse your full VOD catalog."
    authors = listOf("StreamBridge")

    /**
     * Status codes:
     *   0 = Down      – provider is currently broken
     *   1 = Ok        – working normally
     *   2 = Slow      – works but response times are high
     *   3 = Beta      – experimental / may have issues
     */
    status = 1

    tvTypes = listOf("Movie", "TvSeries", "Live")
    language = "en"

    // Update this to your real logo URL before publishing
    iconUrl = "https://raw.githubusercontent.com/YOUR_ORG/streambridge-cs/main/StreamBridgePlugin/icon.png"
}

android {
    compileSdk = 35

    defaultConfig {
        minSdk = 21
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
        // Required by CloudStream Gradle plugin to strip null-check assertions
        // and reduce dex size
        freeCompilerArgs = listOf(
            "-Xno-call-assertions",
            "-Xno-param-assertions",
            "-Xno-receiver-assertions",
        )
    }
}

dependencies {
    // CloudStream stubs — provides the API surface at compile time.
    // The real implementation is supplied by the host app at runtime.
    val cloudstream by configurations
    cloudstream("com.lagradost:cloudstream3:pre-release")

    // HTTP client used by all CloudStream plugins
    implementation("com.github.Blatzar:NiceHttp:0.4.11")

    // JSON parsing (do NOT bump above 2.13.1 — breaks older Android)
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.13.1")
}
