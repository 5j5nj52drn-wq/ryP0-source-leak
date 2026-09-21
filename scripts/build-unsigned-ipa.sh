#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == '--help' || "${1:-}" == '-h' ]]; then
  printf '%s\n' 'Usage: bash scripts/build-unsigned-ipa.sh [output-directory]' \
    'Requires macOS, Xcode 26.4+, Node.js 22.13+, installed npm dependencies,' \
    'and the generated ios/ryP0.xcworkspace with CocoaPods installed.' \
    'Builds a Release arm64 IPA without Apple signing credentials.'
  exit 0
fi

if [[ "$#" -gt 1 ]]; then
  printf '%s\n' 'Expected at most one output directory.' >&2
  exit 1
fi

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

if [[ "$(uname -s)" != Darwin ]]; then
  printf '%s\n' 'An iPhone IPA must be compiled on macOS with Xcode.' >&2
  exit 1
fi

for tool in node xcodebuild xcrun ditto unzip shasum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Required tool is missing: %s\n' "$tool" >&2
    exit 1
  fi
done

node -e '
  const semver = require("semver");
  const rn = require("react-native/package.json");
  if (!semver.satisfies(process.versions.node, ">=22.13.0") ||
      !semver.satisfies(process.versions.node, rn.engines.node)) {
    throw new Error(`Node ${process.versions.node} is incompatible with Expo SDK 57 / React Native ${rn.version}. Use Node 22.23.2.`);
  }
'

xcode_version="$(xcodebuild -version | awk '/^Xcode / { print $2 }')"
node -e '
  const semver = require("semver");
  const version = semver.coerce(process.argv[1]);
  if (!version || !semver.gte(version, "26.4.0")) {
    throw new Error(`Expo SDK 57 requires Xcode 26.4 or newer; selected Xcode is ${process.argv[1]}.`);
  }
' "$xcode_version"

workspace="$project_dir/ios/ryP0.xcworkspace"
if [[ ! -d "$workspace" || ! -f "$project_dir/ios/Pods/Manifest.lock" ]]; then
  printf '%s\n' 'Generate iOS with: npx expo prebuild --platform ios --no-install' \
    'Then install pods with: (cd ios && pod install)' >&2
  exit 1
fi

output_dir="${1:-$project_dir/dist/ios}"
mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
ipa_path="$output_dir/ryP0-unsigned.ipa"
if [[ -e "$ipa_path" || -e "$ipa_path.sha256" ]]; then
  printf 'Output already exists. Choose a new output directory to preserve it: %s\n' "$ipa_path" >&2
  exit 1
fi

# Isolated output avoids stale simulator products and never cleans a user's build.
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/ryp0-unsigned-build.XXXXXX")"
stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/ryp0-ipa-stage.XXXXXX")"
printf 'Xcode build files: %s\nIPA staging files: %s\n' "$build_dir" "$stage_dir"

# RN treats even SKIP_BUNDLING=0 as enabled. Unset it, force bundling, and verify
# the finished Hermes bytecode below so no Metro-dependent IPA can be uploaded.
# Source maps are not needed in an IPA; keep any future debugging maps private.
env -u SKIP_BUNDLING -u SOURCEMAP_FILE \
  NODE_ENV=production FORCE_BUNDLING=1 \
  xcodebuild \
    -workspace "$workspace" \
    -scheme ryP0 \
    -configuration Release \
    -sdk iphoneos \
    -destination 'generic/platform=iOS' \
    -derivedDataPath "$build_dir" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY= \
    DEVELOPMENT_TEAM= \
    PROVISIONING_PROFILE_SPECIFIER= \
    SKIP_BUNDLING= \
    SOURCEMAP_FILE= \
    build 2>&1 | tee "$output_dir/xcodebuild.log"

app_path="$build_dir/Build/Products/Release-iphoneos/ryP0.app"
if [[ ! -d "$app_path" ]]; then
  printf '%s\n' 'Xcode did not produce the expected Release iPhone app.' >&2
  exit 1
fi

executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app_path/Info.plist")"
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Info.plist")"
platform="$(/usr/libexec/PlistBuddy -c 'Print :DTPlatformName' "$app_path/Info.plist")"
if [[ "$platform" != iphoneos ]]; then
  printf 'Unexpected build platform: %s\n' "$platform" >&2
  exit 1
fi

# Xcode 27 / iOS 27 requires UIKit's scene life cycle. Expo SDK 57 generates
# this through expo-build-properties' ios.enableSceneSupport option. Verify the
# finished product rather than letting an IPA that will trap at launch reach a
# user or LiveContainer.
scene_delegate="$(/usr/libexec/PlistBuddy -c 'Print :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneDelegateClassName' "$app_path/Info.plist" 2>/dev/null || true)"
if [[ "$scene_delegate" != 'EXExpoAppSceneDelegate' ]]; then
  printf '%s\n' 'Missing Expo iOS scene lifecycle support in the built app.' \
    'Enable ios.enableSceneSupport with expo-build-properties, regenerate ios, and rebuild.' >&2
  exit 1
fi
# Xcode 26's lipo requires the input before the verification operation.
xcrun lipo "$app_path/$executable" -verify_arch arm64

node - "$app_path" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const app = process.argv[2];
const bundle = fs.readFileSync(path.join(app, 'main.jsbundle'));
const hermesMagic = Buffer.from('c61fbc03c103191f', 'hex');
if (bundle.length <= hermesMagic.length || !bundle.subarray(0, 8).equals(hermesMagic)) {
  throw new Error('Missing embedded Release Hermes bytecode. The IPA must run without Metro.');
}
function verifyAssets(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.endsWith('.map')) {
      throw new Error(`A source map must not ship in the IPA: ${entry.name}`);
    }
    if (entry.isDirectory()) verifyAssets(path.join(directory, entry.name));
  }
}
verifyAssets(app);
console.log(`Verified embedded Hermes bytecode (${bundle.length} bytes).`);
NODE

if [[ -d "$app_path/_CodeSignature" || -f "$app_path/embedded.mobileprovision" ]] ||
  codesign -dv "$app_path" >/dev/null 2>&1; then
  printf '%s\n' 'The app unexpectedly contains a code signature or provisioning profile.' >&2
  exit 1
fi

mkdir -p "$stage_dir/Payload"
ditto --norsrc --noextattr "$app_path" "$stage_dir/Payload/ryP0.app"
ditto -c -k --norsrc --noextattr --keepParent "$stage_dir/Payload" "$ipa_path"
unzip -tq "$ipa_path"
(cd "$output_dir" && shasum -a 256 ryP0-unsigned.ipa > ryP0-unsigned.ipa.sha256)
printf 'Created %s\nBundle identifier: %s\nRe-sign this IPA before installing on an iPhone.\n' "$ipa_path" "$bundle_id"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    printf '%s\n' '### ryP0 unsigned IPA' '' \
      '- Release arm64 iPhone build; embedded Hermes bundle verified.' \
      '- No Apple certificate, provisioning profile, EAS token, or paid developer account used.' \
      '- Download the Actions artifact and re-sign before installing on an iPhone.' \
      "- Artifacts follow this repository's visibility; releases are only created as explicitly requested drafts."
    printf '\nBundle identifier: `%s`\n' "$bundle_id"
  } >> "$GITHUB_STEP_SUMMARY"
fi
