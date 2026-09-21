# Build an unsigned ryP0 IPA

The **Xcode - Build ryP0 IPA** workflow compiles this Expo app for a real iPhone,
with its Release Hermes JavaScript bundle embedded. It does not need Metro, EAS,
an Apple certificate, or a paid Apple Developer membership to create the IPA.
The file still needs to be signed by your preferred iOS signing tool before it
can be installed on a normal iPhone. Creating an unsigned IPA does not bypass
iOS signing or enable App Store/TestFlight distribution.

## GitHub Actions

The workflow is **manual only**: use **Actions → Xcode - Build ryP0 IPA → Run
workflow** when you explicitly want an IPA. Download `ryP0-unsigned-<run
number>` from the completed run's Artifacts section. The ZIP contains the IPA
and a SHA-256 checksum. Build artifacts are retained for 14 days.

The build uses Node 22.23.2 and Xcode 26.6 on `macos-26`. Expo SDK 57 requires
[Node 22.13+ and Xcode 26.4+](https://docs.expo.dev/versions/v57.0.0/).
The toolchain versions and action commit pins are explicit so updates can be
reviewed. GitHub-hosted macOS minutes are subject to your GitHub plan's limits.

`ios/` is intentionally ignored in this repository. Every clean runner:

1. Runs `npm ci --include=dev`, including the `patch-package` postinstall hook.
2. Checks TypeScript, generates iOS using Expo Prebuild, and installs CocoaPods.
3. Runs `scripts/build-unsigned-ipa.sh` to compile Release without signing.
4. Verifies the iPhone/arm64 binary, the required UIKit scene lifecycle for
   Xcode/iOS 27, and embedded Hermes bytecode; rejects source maps in the app,
   then packages and checks the IPA.

Keep native configuration in `app.json`, config plugins, and tracked local
modules. Changes made only to the ignored `ios/` folder cannot reach a fresh
GitHub build. This follows Expo's
[native generation workflow](https://docs.expo.dev/workflow/continuous-native-generation/).

## API configuration

Set the public control API URL under **Settings → Secrets and variables →
Actions → Variables** when the private service has been deployed:

- `EXPO_PUBLIC_CONTROL_API_URL`

These values are baked into the IPA. GitHub Actions does not read your local
`.env` file or EAS project environment automatically; changing an endpoint
requires another build. Do not place GitHub tokens, Telegram sessions, R2 keys,
or server-only secrets in an `EXPO_PUBLIC_*` value. Authentication and service
credentials belong on the API host or private automation runner.

## Source privacy and releases

The build job has only `contents: read`, does not persist checkout credentials,
and uploads only the IPA/checksum. Source archives, source maps, signing keys,
and Xcode archives are not uploaded. Failed Xcode logs are retained for 7 days.

Artifacts follow repository visibility. Keep this workflow in the private
source repository if the source and logs should remain private. An IPA contains
compiled code and can be inspected; private source and Hermes bytecode do not
make embedded secrets safe.

The optional `create_draft_release` checkbox works only on a manual run of the
default branch. A separate job receives `contents: write` and creates a **draft**
prerelease in the same repository with the IPA/checksum. Pushes and pull requests
never publish a release. Review and publish a draft yourself if desired; there
is no implicit upload to another public releases repository. GitHub creates
source archives when a repository release is published, so use the separate
public `Sami-Wali/ryP0-repository` repository when distributing binaries from
the private source repository.

## Run locally on a Mac

After selecting Xcode 26.4 or newer and Node 22.23.2:

```sh
npm ci --include=dev
npx expo prebuild --clean --platform ios --no-install
(cd ios && pod install)
bash scripts/build-unsigned-ipa.sh
```

Output: `dist/ios/ryP0-unsigned.ipa` and its `.sha256` file. A second run must use
a new output directory, for example:

```sh
bash scripts/build-unsigned-ipa.sh dist/ios-build-2
```

The script preserves existing IPA files and prints its temporary build/staging
directories for inspection. It deliberately unsets `SKIP_BUNDLING`: even setting
that variable to `0` makes React Native skip bundling. A missing or invalid
`main.jsbundle` fails verification before an IPA is handed off.

## Test a development build in the iOS Simulator

`npx expo start --ios` starts Metro; it does not create the native development
app that this project needs. After an iOS native configuration change, install a
fresh development build once:

```sh
npx expo run:ios
```

Then, for normal JavaScript/UI work, start the local server with:

```sh
npx expo start --dev-client
```

The unsigned Release IPA above is different: it already contains its JavaScript
bundle and must not depend on Metro when opened through a signing tool or
LiveContainer.

## Admin and public binaries

The same private source tree produces two intentionally separate apps:

- `admin` is **ryP0 Admin** (`com.ry0.ryP0.admin`). It can unlock the verified
  administrator account and stores its local GitHub credential in the device
  Keychain.
- `public` is **ryP0** (`com.ry0.ryP0`). It cannot store a GitHub
  credential or open catalog-management routes; it can browse the catalog and
  submit app requests for review.

Build the one you intend to install. Do not distribute the Admin IPA.

### Separate app icons

Both icon files must be square 1024×1024 PNG images with no manually drawn
rounded corners. iOS supplies the final icon mask itself.

- Put the public icon at `assets/icon-public.png`.
- Put the private admin icon at `assets/icon-admin.png`.

The build selects the matching image automatically. Until a variant-specific
file exists, it safely falls back to the current `assets/icon.png` file.

```sh
# Your private administrator build
RYP0_APP_VARIANT=admin bash scripts/build-unsigned-ipa.sh dist/ios/admin

# Consumer build for other people
RYP0_APP_VARIANT=public bash scripts/build-unsigned-ipa.sh dist/ios/public
```

After changing native configuration, regenerate and install pods once for the
same variant before building the IPA:

```sh
RYP0_APP_VARIANT=public npx expo prebuild --clean --platform ios --no-install
(cd ios && pod install)
```

## Local credential check

Run this before committing or building a distribution IPA:

```sh
npm run security:scan
```

It checks tracked source, untracked files, and local `.env*` files for likely
credentials without ever printing their values. Only public, non-secret
configuration such as `EXPO_PUBLIC_CONTROL_API_URL` may use the `EXPO_PUBLIC_`
prefix.
