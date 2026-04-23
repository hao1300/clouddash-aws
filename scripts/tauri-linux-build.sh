#!/bin/bash

# Exit on error
set -e

# Get version from tauri.conf.json
VERSION=$(grep '"version":' src-tauri/tauri.conf.json | head -1 | awk -F: '{ print $2 }' | sed 's/[", ]//g')

if [ -z "$VERSION" ]; then
  echo "Error: Could not find version in src-tauri/tauri.conf.json"
  exit 1
fi

echo "Building CloudDash version $VERSION..."

# Run tauri build
npm run tauri-build

# Define paths
RELEASE_DIR="/mnt/c/CS/aws-console-releases"
BUNDLE_DIR="src-tauri/target/release/bundle"

echo "Creating release directory: $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# Helper function to copy and rename
copy_bundle() {
  local ext=$1
  local subdir=$2
  
  # Find files matching the extension in the subdir
  # Using find to be safer with wildcards
  local file=$(find "$BUNDLE_DIR/$subdir" -maxdepth 1 -name "*.$ext" | head -n 1)
  
  if [ -n "$file" ]; then
    echo "Copying $ext bundle: $file"
    cp "$file" "$RELEASE_DIR/clouddash-$VERSION.$ext"
  else
    echo "Warning: No $ext bundle found in $BUNDLE_DIR/$subdir"
  fi
}

# Copy and rename packages
copy_bundle "AppImage" "appimage"
copy_bundle "deb" "deb"
copy_bundle "rpm" "rpm"

echo "--------------------------------------------------"
echo "Build complete!"
echo "Packages available in $RELEASE_DIR:"
ls -lh "$RELEASE_DIR" | grep "$VERSION"
