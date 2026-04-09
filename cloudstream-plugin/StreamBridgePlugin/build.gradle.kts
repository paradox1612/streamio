plugins {
    id("com.android.library")
    id("kotlin-android")
    id("com.lagradost.cloudstream3.gradle")
}

version = 1

cloudstream {
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

    iconUrl = "https://raw.githubusercontent.com/YOUR_ORG/streambridge-cs/main/StreamBridgePlugin/icon.png"
}

android {
    namespace = "com.streambridge.cloudstream"
    compileSdk = 33

    defaultConfig {
        minSdk = 24
        targetSdk = 33
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = "11"
    }
}

repositories {
    google()
    mavenCentral()
    mavenLocal()
    maven("https://jitpack.io")
}

dependencies {
    apk("com.lagradost:cloudstream3:pre-release")
    implementation(kotlin("stdlib", kotlin.coreLibrariesVersion))

    // HTTP client used by all CloudStream plugins
    implementation("com.github.Blatzar:NiceHttp:0.4.11")

    // JSON parsing (do NOT bump above 2.13.1 — breaks older Android)
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.13.1")
}
