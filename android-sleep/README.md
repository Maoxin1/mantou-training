# Read-only Android sleep diagnostic

This is a diagnostic build, not automatic synchronization. Only READ_SLEEP is requested. No INTERNET permission, no health write operations, no analytics or uploads. Displays seven days of session counts, origins and intervals locally. Permission denial and read errors are not displayed as zero records. Rechecks permissions on every request and handles pagination. Privacy explanation is accessible from Health Connect.

Build with Java 17, Gradle 8.13, Android SDK 36: `gradle -p android-sleep :app:assembleDebug :app:lintDebug`. The dedicated GitHub Actions workflow builds an installable debug APK artifact. Actual permissions and data reads still require physical-device verification. Debug signing is for temporary diagnosis, not a long-term release identity.

User target: Galaxy S23 Ultra, China firmware, Android 16 / One UI 8.5, Samsung Health 7.1.0.054. Sleep read/write permissions granted to Samsung Health; manually synchronized, but Health Connect UI still has no sleep category. No device health data belongs in this repository.
