#!/bin/bash
# Generate PWA icons from SVG
# Requires: ImageMagick (brew install imagemagick)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_DIR="$SCRIPT_DIR/../public"

# Check if convert command exists
if ! command -v convert &> /dev/null; then
    echo "❌ ImageMagick is required. Install with: brew install imagemagick"
    exit 1
fi

echo "🎨 Generating PWA icons..."

# Generate PWA icons from favicon.svg
convert -background none "$PUBLIC_DIR/favicon.svg" -resize 192x192 "$PUBLIC_DIR/pwa-192x192.png"
convert -background none "$PUBLIC_DIR/favicon.svg" -resize 512x512 "$PUBLIC_DIR/pwa-512x512.png"
convert -background none "$PUBLIC_DIR/favicon.svg" -resize 180x180 "$PUBLIC_DIR/apple-touch-icon.png"
convert -background none "$PUBLIC_DIR/favicon.svg" -resize 32x32 "$PUBLIC_DIR/favicon-32x32.png"
convert -background none "$PUBLIC_DIR/favicon.svg" -resize 16x16 "$PUBLIC_DIR/favicon-16x16.png"

# Generate ICO file (multi-resolution)
convert "$PUBLIC_DIR/favicon-16x16.png" "$PUBLIC_DIR/favicon-32x32.png" "$PUBLIC_DIR/favicon.ico"

echo "✅ PWA icons generated successfully!"
echo ""
echo "Generated files:"
ls -la "$PUBLIC_DIR"/*.png "$PUBLIC_DIR"/*.ico 2>/dev/null || true
