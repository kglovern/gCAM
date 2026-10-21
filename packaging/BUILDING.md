# Native builds

The React renderer is shared by the website, Electron desktop application and
Cordova tablet application. Use Node 24. Native builds use `--base ./`; the
website retains its GitHub Pages base. No runtime web server is required.

## Desktop

From `react/`, install with `yarn install --frozen-lockfile` and run
`yarn build --base ./`. From the repository root, run
`node packaging/scripts/stage.mjs desktop`. Then, from `packaging/desktop/`:

```sh
npm ci
npm test
npm run smoke
npm run package
```

The `Build and test` workflow groups quality checks, browser tests, desktop
installers and tablet builds into one run, with separate logs and artifacts. On
main, the website publishes after all checks pass.

The `Desktop installers` job builds Windows x64 NSIS, Linux x64 AppImage/deb and macOS
Apple Silicon DMG/zip artifacts. Each platform smoke-tests its actual renderer,
local catalogue and CAM worker before packaging. The default artifacts are
unsigned; no certificates or release publishing tokens are needed for CI builds.

## Android and iPad

Build the renderer with the same relative base, then run
`node packaging/scripts/stage.mjs mobile` from the repository root. From
`packaging/mobile/`, run `npm ci`. Back at the repository root, run
`node packaging/scripts/mobile-platform.mjs android` or `ios` to install the
exact version from the mobile manifest. In `packaging/mobile/`, run:

```sh
npx cordova plugin add ../plugins/gcam-files --nosave
npx cordova build android --debug -- --packageType=apk
# On macOS with Xcode:
npx cordova build ios --debug --emulator -- --buildFlag=CODE_SIGNING_ALLOWED=NO
```

The `Tablet builds` job produces an installable Android debug APK and an iPad simulator
application on pull requests and pushes to main. Download the artifacts from the
workflow run. Android uses Java 17, Android SDK/build tools 36 and Gradle 8.14.2;
iOS requires macOS and Xcode. iPad is the smallest Apple target.

The local `gcam-files` plugin exports G-code, projects and configuration through
Android's Create Document picker or iPad's export document picker. It does not
request broad storage access. Existing HTML file inputs handle imports.

The native startup screen animates a cutter following a contour until the editor
has rendered and Cordova's bridge is ready. It respects reduced motion, stops
when dismissed and offers retry on startup failure. There is no artificial
progress percentage or minimum display time.

## Signed tablet releases

Run `Build and test` manually and enable the relevant signing input. Signing
credentials are read only by that explicitly requested job, never PR builds.

For `signed_android`, configure these repository secrets:

- `ANDROID_KEYSTORE_BASE64`: base64-encoded existing release keystore.
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

The job generates signed APK and AAB artifacts. Keep the same keystore for app
updates. Default debug builds use a development key and are intended for testing.

For `signed_ios`, configure secrets in the `ios-signing` GitHub environment:

- `IOS_CERTIFICATE_BASE64`: Apple Distribution certificate exported as a P12.
- `IOS_CERTIFICATE_PASSWORD`: its export password.
- `IOS_PROFILE_BASE64`: an ad-hoc distribution provisioning profile for
  `com.petervanderwalt.gcam`, including the intended iPads.
- `IOS_TEAM_ID`: the matching Apple Developer team.
- `IOS_KEYCHAIN_PASSWORD`: a random password for the temporary build keychain.

The job exports an ad-hoc IPA. A simulator `.app` cannot be installed on a real
iPad. App Store/TestFlight distribution needs an appropriate profile and export
method; this workflow does not upload to either store. Temporary signing files
and keychains are removed after the job.

## References

- [gSender desktop build workflow](https://github.com/Sienci-Labs/gsender/blob/master/.github/workflows/CI.yml).
- [gSender Android startup animation](https://github.com/Sienci-Labs/gsender/blob/features/android_v2/android/app/src/main/java/org/sienci/gsender/pendant/RocketLaunchView.kt).
- [Electron protocol API](https://www.electronjs.org/docs/latest/api/protocol).
- [Cordova Android requirements](https://cordova.apache.org/docs/en/latest/guide/platforms/android/).
- [Cordova iOS build and signing](https://cordova.apache.org/docs/en/latest/guide/platforms/ios/).
