#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
: "${RUNNER_TEMP:?Signing runs on a macOS GitHub runner}"
keychain="$RUNNER_TEMP/gcam-signing.keychain-db"
profile="$RUNNER_TEMP/gcam.mobileprovision"
certificate="$RUNNER_TEMP/gcam-signing.p12"
profile_dir="$HOME/Library/MobileDevice/Provisioning Profiles"
if [[ "${1:-}" == --clean ]]; then
    security delete-keychain "$keychain" 2>/dev/null || true
    if [[ -f "$RUNNER_TEMP/gcam-profile-uuid" ]]; then
        uuid="$(cat "$RUNNER_TEMP/gcam-profile-uuid")"
        rm -f "$profile_dir/$uuid.mobileprovision"
    fi
    rm -f "$profile" "$certificate" "$RUNNER_TEMP/gcam-profile.plist" "$RUNNER_TEMP/gcam-profile-uuid" "$root/packaging/mobile/build.json"
    exit 0
fi
for key in IOS_CERTIFICATE_BASE64 IOS_CERTIFICATE_PASSWORD IOS_PROFILE_BASE64 IOS_TEAM_ID IOS_KEYCHAIN_PASSWORD; do
    if [[ -z "${!key:-}" ]]; then echo "Missing signing secret: $key" >&2; exit 1; fi
done
printf '%s' "$IOS_CERTIFICATE_BASE64" | base64 --decode > "$certificate"
printf '%s' "$IOS_PROFILE_BASE64" | base64 --decode > "$profile"
chmod 600 "$certificate" "$profile"
security create-keychain -p "$IOS_KEYCHAIN_PASSWORD" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$IOS_KEYCHAIN_PASSWORD" "$keychain"
security import "$certificate" -P "$IOS_CERTIFICATE_PASSWORD" -k "$keychain" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -k "$IOS_KEYCHAIN_PASSWORD" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain" "$HOME/Library/Keychains/login.keychain-db"
security cms -D -i "$profile" > "$RUNNER_TEMP/gcam-profile.plist"
uuid="$(/usr/libexec/PlistBuddy -c 'Print UUID' "$RUNNER_TEMP/gcam-profile.plist")"
mkdir -p "$profile_dir"
cp "$profile" "$profile_dir/$uuid.mobileprovision"
printf '%s' "$uuid" > "$RUNNER_TEMP/gcam-profile-uuid"
export GCAM_PROFILE_UUID="$uuid" GCAM_BUILD_CONFIG="$root/packaging/mobile/build.json"
node -e 'require("node:fs").writeFileSync(process.env.GCAM_BUILD_CONFIG, JSON.stringify({ios:{release:{codeSignIdentity:"Apple Distribution",developmentTeam:process.env.IOS_TEAM_ID,provisioningProfile:process.env.GCAM_PROFILE_UUID,packageType:"ad-hoc",automaticProvisioning:false}}}), {mode:0o600})'
