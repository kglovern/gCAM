# Releases and updates

Create a stable tag on a merged main commit, for example:

```sh
git switch main
git pull --ff-only
git tag v0.2.0
git push origin v0.2.0
```

The single **Build and test** run checks main ancestry and the tag, stamps all
app versions, runs checks, builds installers and prepares a **draft GitHub
Release**. Review its downloads, then publish it. Only published stable releases
are offered to installed apps. Do not move tags or replace published binaries;
use a higher version for every release. Reruns can replace assets on a draft.

Tags use `vMAJOR.MINOR.PATCH`, each component 0–999. Android gets a monotonically
increasing version code from those components. Desktop manifests, Cordova config,
native version information and the renderer are stamped together during CI.

## Electron

The installed app checks GitHub on startup. Config also has **Check for updates**.
Users choose **Download update**, then **Restart to update**. A confirmation asks
them to save first. Quitting normally never installs an update automatically.
Offline checks leave the editor available and can be retried. Update metadata
(`latest*.yml`) and blockmaps must remain attached alongside installers.

Windows NSIS and Linux AppImage builds support this flow. Keep the same app ID
and installation location between releases. macOS updates require signed builds;
configure the following repository secrets before distributing a Mac release:

- `MAC_CERTIFICATE_BASE64`: Developer ID Application certificate P12, base64 encoded.
- `MAC_CERTIFICATE_PASSWORD`: its password.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`: notarization identity.

Optional Windows Authenticode signing uses `WINDOWS_CERTIFICATE_BASE64` and
`WINDOWS_CERTIFICATE_PASSWORD`. Existing unsigned installations still need an
initial installer containing this updater; older builds cannot discover it.
Unsigned Mac artifacts are for manual testing, not an automatic-update channel.

## Android

Release tags require the permanent Android signing secrets listed in
[BUILDING.md](BUILDING.md#signed-tablet-releases). The release includes a signed
APK and AAB. Keep a secure backup of the keystore; a new signing key cannot update
existing installations signed by the old one.

The app checks the latest published GitHub release and offers **Download APK**.
This opens its versioned APK in the system browser; Android requires the user's
approval to install it. It is not a silent installer. The package ID stays the
same, so a normal upgrade retains app data.

Earlier CI debug APKs used temporary debug keys. Export projects before replacing
those installations with a signed release; Android may require uninstalling them.
Do not distribute debug APKs as stable releases.

## iPad / TestFlight

Apple controls installation and updates. GitHub cannot install an arbitrary IPA
on users' iPads. Create an App Store Connect app for `com.petervanderwalt.gcam`
and enable the optional store-upload job with repository variable
`IOS_RELEASE_ENABLED=true`.

In the `ios-signing` environment configure the existing iOS signing secrets from
[BUILDING.md](BUILDING.md#signed-tablet-releases), using an **App Store distribution
profile** instead of the ad-hoc profile. Also configure:

- `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`.
- `APP_STORE_CONNECT_KEY_BASE64`: the App Store Connect API `.p8` key, base64 encoded.

Set repository variable `IOS_UPDATE_URL` to the public TestFlight invitation URL
(`https://testflight.apple.com/join/...`), or later the App Store app URL. This
link is bundled into the app and opened by **Open TestFlight/App Store** when a
newer GitHub release exists. Changing it requires a new app build. Without it the
app explains that Apple distribution has not been configured.

Tagged releases build a signed store IPA using Xcode 26 and upload it to App Store
Connect. Wait for Apple processing and any beta review, select the tester group
in TestFlight, then publish the GitHub release. TestFlight/App Store delivers the
actual update according to the user's settings. Store submission/review and tester
enrollment are managed in App Store Connect; the workflow does not submit an app
for public review. Keep `IOS_RELEASE_ENABLED` off until the account and secrets
are ready. Simulator builds remain available on ordinary PRs.

## Verification before the first public release

CI tests version validation, update URL restrictions, explicit download/restart
actions and native compilation. Real signed upgrades still need two installed
versions: verify project recovery, Android signing continuity and Mac notarization
on devices. No production tag is created by the setup itself.
