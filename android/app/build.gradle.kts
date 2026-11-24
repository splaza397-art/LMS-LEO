plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "org.iinicia.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "org.iinicia.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        manifestPlaceholders["appAuthRedirectScheme"] = "org.iinicia.app"
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_URL", "\"http://localhost:4000/api/v1\"")
            buildConfigField("String", "ISSUER_URL", "\"http://localhost:8180/realms/iinicia\"")
            buildConfigField("boolean", "ALLOW_HTTP", "true")
            manifestPlaceholders["networkConfig"] = "@xml/network_security_debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "API_URL", "\"${providers.gradleProperty("iinicia.api.url").get()}\"")
            buildConfigField("String", "ISSUER_URL", "\"${providers.gradleProperty("iinicia.issuer.url").get()}\"")
            buildConfigField("boolean", "ALLOW_HTTP", "false")
            manifestPlaceholders["networkConfig"] = "@xml/network_security_release"
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.09.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.navigation:navigation-compose:2.9.5")
    implementation("androidx.browser:browser:1.9.0")
    implementation("androidx.work:work-runtime-ktx:2.10.5")
    implementation("net.openid:appauth:0.11.1")
    implementation("com.squareup.okhttp3:okhttp:5.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}
