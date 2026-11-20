#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

app="${1:?Pass the built .app bundle}"
package="${2:?Pass the output .pkg path}"
[[ -f "$app/Contents/Info.plist" && -f "$app/Contents/Resources/icon.icns" ]] ||
  fail 'The CloudDash app bundle or its icon is missing.'

for name in MAC_APP_STORE_APP_CERTIFICATE MAC_APP_STORE_APP_CERTIFICATE_PASSWORD \
  MAC_APP_STORE_INSTALLER_CERTIFICATE MAC_APP_STORE_INSTALLER_CERTIFICATE_PASSWORD \
  MAC_APP_STORE_PROVISIONING_PROFILE; do
  [[ -n "${!name:-}" ]] || fail "The $name signing value is required."
done

umask 077
scratch="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/clouddash-mac-app-store.XXXXXX")"
keychain="$scratch/signing.keychain-db"
cleanup() {
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  rm -rf -- "$scratch"
}
trap cleanup EXIT

profile="$scratch/embedded.provisionprofile"
profile_plist="$scratch/profile.plist"
printf '%s' "$MAC_APP_STORE_PROVISIONING_PROFILE" | base64 -D > "$profile"
security cms -D -i "$profile" -o "$profile_plist"

plist=/usr/libexec/PlistBuddy
bundle_id="$("$plist" -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")"
team_id="$("$plist" -c 'Print :TeamIdentifier:0' "$profile_plist")"
app_id="$("$plist" -c 'Print :Entitlements:com.apple.application-identifier' "$profile_plist")"
[[ "$bundle_id" == dev.clouddash.aws && "$team_id" =~ ^[A-Z0-9]{10}$ && "$app_id" == "$team_id.$bundle_id" ]] ||
  fail 'Use a Mac App Store Connect profile for dev.clouddash.aws from the signing team.'
profile_certificate="$(plutil -extract DeveloperCertificates.0 raw -o - "$profile_plist" |
  base64 -D | shasum -a 1 | awk '{print toupper($1)}')"

keychain_password="$(openssl rand -hex 24)"
security create-keychain -p "$keychain_password" "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 3600 "$keychain"
security list-keychains -d user -s "$keychain"

# The Mac App Store distribution identities are issued under Apple's WWDR G3 intermediate.
curl --fail --silent --show-error --location --retry 3 \
  'https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer' -o "$scratch/wwdr-g3.cer"
security import "$scratch/wwdr-g3.cer" -k "$keychain"
printf '%s' "$MAC_APP_STORE_APP_CERTIFICATE" | base64 -D > "$scratch/app.p12"
security import "$scratch/app.p12" -k "$keychain" -P "$MAC_APP_STORE_APP_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign
printf '%s' "$MAC_APP_STORE_INSTALLER_CERTIFICATE" | base64 -D > "$scratch/installer.p12"
security import "$scratch/installer.p12" -k "$keychain" -P "$MAC_APP_STORE_INSTALLER_CERTIFICATE_PASSWORD" \
  -T /usr/bin/productbuild -T /usr/bin/productsign
rm -f -- "$scratch/app.p12" "$scratch/installer.p12"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" >/dev/null

app_identity="$(security find-identity -v -p codesigning "$keychain" | awk -v fingerprint="$profile_certificate" '
  $2 == fingerprint && /"(Apple Distribution|3rd Party Mac Developer Application|Mac App Distribution):/ { print $2 }
')"
[[ "$app_identity" == "$profile_certificate" ]] ||
  fail 'Supply the app distribution certificate and private key selected in the provisioning profile.'
installer_identity="$(security find-identity -v "$keychain" |
  sed -nE 's/^[[:space:]]*[0-9]+\) [0-9A-F]+ "((3rd Party Mac Developer Installer|Mac Installer Distribution):[^"]+)"$/\1/p')"
[[ -n "$installer_identity" && "$installer_identity" != *$'\n'* && "$installer_identity" == *"($team_id)" ]] ||
  fail 'Supply one Mac Installer Distribution certificate and private key from the same Apple team.'

entitlements="$scratch/entitlements.plist"
cp src-tauri/macos/AppStore.entitlements "$entitlements"
"$plist" -c "Add :com.apple.application-identifier string $app_id" "$entitlements"
"$plist" -c "Add :com.apple.developer.team-identifier string $team_id" "$entitlements"
install -m 0644 "$profile" "$app/Contents/embedded.provisionprofile"

printf 'Signing the CloudDash app bundle.\n'
codesign --force --sign "$app_identity" --keychain "$keychain" --entitlements "$entitlements" "$app"
codesign --verify --deep --strict --verbose=2 "$app"
printf 'Signing the Mac App Store installer package.\n'
productbuild --component "$app" /Applications --sign "$installer_identity" --keychain "$keychain" "$package"
pkgutil --check-signature "$package"
