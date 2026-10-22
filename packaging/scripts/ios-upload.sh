#!/usr/bin/env bash
set -euo pipefail
: "${RUNNER_TEMP:?Upload runs on a macOS GitHub runner}"
for key in APP_STORE_CONNECT_KEY_ID APP_STORE_CONNECT_ISSUER_ID APP_STORE_CONNECT_KEY_BASE64; do
    if [[ -z "${!key:-}" ]]; then echo "Missing App Store Connect secret: $key" >&2; exit 1; fi
done
[[ "$APP_STORE_CONNECT_KEY_ID" =~ ^[A-Za-z0-9]+$ ]] || { echo 'Invalid API key ID' >&2; exit 1; }
key_directory="$RUNNER_TEMP/gcam-app-store-keys"
mkdir -p "$key_directory"
chmod 700 "$key_directory"
trap 'rm -f "$key_directory/AuthKey_$APP_STORE_CONNECT_KEY_ID.p8"' EXIT
printf '%s' "$APP_STORE_CONNECT_KEY_BASE64" | base64 --decode > "$key_directory/AuthKey_$APP_STORE_CONNECT_KEY_ID.p8"
chmod 600 "$key_directory/AuthKey_$APP_STORE_CONNECT_KEY_ID.p8"
root="$(cd "$(dirname "$0")/../.." && pwd)"
package="$(find "$root/packaging/mobile/platforms/ios/build" -type f -name '*.ipa' -print)"
[[ -f "$package" ]] || { echo 'Expected exactly one signed IPA.' >&2; exit 1; }
export API_PRIVATE_KEYS_DIR="$key_directory"
xcrun altool --upload-app -f "$package" -t ios --apiKey "$APP_STORE_CONNECT_KEY_ID" --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"
