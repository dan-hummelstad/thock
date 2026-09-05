#!/bin/bash
# Build a shareable thock.app — Release, ad-hoc signed. No Apple account, provisioning,
# or notarization needed; it runs on any Mac once the recipient clears Gatekeeper (see
# README "Sharing the app"). Ad-hoc keeps the signature stable per build, so the
# recipient's Accessibility / Screen Recording grants stick.
#
# Needs full Xcode (not just Command Line Tools):
#   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
set -euo pipefail
cd "$(dirname "$0")"

rm -rf build dist

xcodebuild \
  -project thock.xcodeproj \
  -scheme thock \
  -configuration Release \
  -derivedDataPath build \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="-" \
  DEVELOPMENT_TEAM="" \
  PROVISIONING_PROFILE_SPECIFIER="" \
  -quiet \
  build

APP="build/Build/Products/Release/thock.app"
mkdir -p dist
cp -R "$APP" dist/
ditto -c -k --keepParent dist/thock.app dist/thock.zip

echo
echo "Built:  dist/thock.app   (drag to /Applications to run locally)"
echo "Share:  dist/thock.zip   (send this; recipient: see README)"
