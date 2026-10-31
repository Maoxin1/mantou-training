# Read-only Android sleep diagnostic

This is a diagnostic build, not automatic synchronization. Only READ_SLEEP is requested. No INTERNET permission, no health write operations, no analytics or uploads. Displays seven days of session counts, origins and intervals locally. Permission denial and read errors are not displayed as zero records. Rechecks permissions on every request and handles pagination. Privacy explanation is accessible from Health Connect.

Build with Java 17, Gradle 8.13, Android SDK 36: `gradle -p android-sleep :app:assembleDebug :app:lintDebug`. The dedicated GitHub Actions workflow builds an installable debug APK artifact. Actual permissions and data reads still require physical-device verification. Debug signing is for temporary diagnosis, not a long-term release identity.

User target: Galaxy S23 Ultra, China firmware, Android 16 / One UI 8.5, Samsung Health 7.1.0.054. Sleep read/write permissions granted to Samsung Health; manually synchronized, but Health Connect UI still has no sleep category. No device health data belongs in this repository.

## 2026-11-01 build verification

Diagnostic APK 0.1.0 compiled successfully with Android SDK 36. GitHub Actions assembleDebug and lintDebug both passed: https://github.com/Maoxin1/mantou-training/actions/runs/41192518150 . Artifact name: mantou-sleep-diagnostic. Source commit: f9b874b.

APK size 11,432,800 bytes; SHA-256 dfa35a53693fdb39cbeb1e4208684e666bd88a116b75ce5c25e23672331d90d2. Binary manifest inspection confirms READ_SLEEP present, INTERNET/WRITE_SLEEP/background health read permissions absent. This is not an independent cryptographic signature audit. No phone/emulator execution has been completed; installation, permission grant and actual reading remain device acceptance tasks.

Install on the user's S23 Ultra, open mantou 睡眠诊断, tap 检查睡眠记录, grant only sleep read access. Return the displayed result: API unavailable / permission denied / read error / zero records / records with origins. A zero count means no records visible to this query, not proof that Samsung Health has no underlying sleep data. Do not fabricate data or upload snapshots automatically.

## 2026-11-01 physical-device result

User screenshots confirm APK installs/launches on S23 Ultra (China firmware, Android 16), Health Connect SDK available, READ_SLEEP granted, seven-day unfiltered SleepSessionRecord query completes with zero returned sessions. Permission prompt contains only sleep read access. This is evidence of zero records visible to this query, not a definitive diagnosis of Samsung Health export failure or region restriction. No production data uploaded or modified. Stop repeating UI permission toggles/manual sync.

Next feasibility path: Samsung Health Data SDK read-only sleep probe. Official FAQ allows development without partner registration via Samsung Health developer mode; deployed applications require package/signature partner verification. An enabled developer mode and actual read result are still required; no claim of a working alternative or background sync. Also retain diagnostic limitations: seven-day query uses phone clock, and no record visibility beyond that range has been tested.
