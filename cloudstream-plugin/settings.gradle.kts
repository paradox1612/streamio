rootProject.name = "StreamBridgePlugins"

buildscript {
    repositories {
        google()
        mavenCentral()
        mavenLocal()
        maven("https://jitpack.io")
    }
    dependencies {
        classpath("com.android.tools.build:gradle:7.4.2")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.8.21")
        classpath("com.github.recloudstream:gradle:master-SNAPSHOT")
    }
}

include("StreamBridgePlugin")
