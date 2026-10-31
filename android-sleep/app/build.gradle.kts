plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "app.mantou.sleep"
    compileSdk = 36
    defaultConfig { applicationId = "app.mantou.sleep.diagnostic"; minSdk = 28; targetSdk = 36; versionCode = 1; versionName = "0.1.0-diagnostic" }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.0")
    implementation("androidx.health.connect:connect-client:1.1.0")
}
