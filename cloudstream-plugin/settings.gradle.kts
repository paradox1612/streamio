rootProject.name = "StreamBridgePlugins"

buildscript {
    repositories {
        google()
        mavenCentral()
        mavenLocal()
        maven("https://jitpack.io")
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.5.2")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.0")
        classpath("com.github.recloudstream:gradle:master-SNAPSHOT")
    }
}

include("StreamBridgePlugin")
