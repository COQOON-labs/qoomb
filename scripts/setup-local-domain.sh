#!/bin/bash

set -e

echo "🔧 Setting up qoomb.localhost development environment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if mkcert is installed
if ! command -v mkcert &> /dev/null; then
    echo -e "${YELLOW}📦 Installing mkcert...${NC}"
    brew install mkcert
fi

# Check if Caddy is installed
if ! command -v caddy &> /dev/null; then
    echo -e "${YELLOW}📦 Installing Caddy...${NC}"
    brew install caddy
fi

# Install local CA
echo -e "${GREEN}🔐 Installing local CA...${NC}"
mkcert -install

# Create certs directory if it doesn't exist
mkdir -p certs

# Get local IP address (for mobile testing)
LOCAL_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo "127.0.0.1")

# Generate certificates for qoomb.localhost AND local IP in one certificate
echo -e "${GREEN}📜 Generating SSL certificates (including IP: ${LOCAL_IP})...${NC}"
cd certs
mkcert qoomb.localhost "*.qoomb.localhost" localhost 127.0.0.1 ::1 "$LOCAL_IP"

cd ..

# Copy root CA to web public folder in multiple formats (iOS can be picky!)
echo -e "${GREEN}📱 Preparing mobile certificate access (HTTP server on port 8888)...${NC}"
mkdir -p apps/web/public/dev-cert

MKCERT_CA="$HOME/Library/Application Support/mkcert/rootCA.pem"

if [ -f "$MKCERT_CA" ]; then
    # Copy as .crt (PEM format)
    cp "$MKCERT_CA" apps/web/public/dev-cert/mkcert-root-ca.crt
    # Copy as .pem (PEM format)
    cp "$MKCERT_CA" apps/web/public/dev-cert/mkcert-root-ca.pem
    # Convert to .cer (DER format - iOS preferred)
    openssl x509 -outform der -in "$MKCERT_CA" -out apps/web/public/dev-cert/mkcert-root-ca.cer 2>/dev/null || cp "$MKCERT_CA" apps/web/public/dev-cert/mkcert-root-ca.cer

    # Create iOS .mobileconfig profile (native iOS format with Qoomb branding)
    CERT_BASE64=$(base64 -i "$MKCERT_CA" | tr -d '\n')
    UUID1=$(uuidgen)
    UUID2=$(uuidgen)

    cat > apps/web/public/dev-cert/mkcert-root-ca.mobileconfig << MOBILECONFIG_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadCertificateFileName</key>
            <string>qoomb-dev-root-ca.pem</string>
            <key>PayloadContent</key>
            <data>
$CERT_BASE64
            </data>
            <key>PayloadDescription</key>
            <string>Root CA certificate for Qoomb local development server (HTTPS)</string>
            <key>PayloadDisplayName</key>
            <string>🐝 Qoomb Development Root CA</string>
            <key>PayloadIdentifier</key>
            <string>com.qoomb.dev.root-ca</string>
            <key>PayloadType</key>
            <string>com.apple.security.root</string>
            <key>PayloadUUID</key>
            <string>$UUID1</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
        </dict>
    </array>
    <key>PayloadDescription</key>
    <string>Installs the development certificate for local Qoomb development. This allows HTTPS access to https://qoomb.localhost and your local IP without security warnings.</string>
    <key>PayloadDisplayName</key>
    <string>🐝 Qoomb Development Certificate</string>
    <key>PayloadIdentifier</key>
    <string>com.qoomb.dev.profile</string>
    <key>PayloadOrganization</key>
    <string>Qoomb Development</string>
    <key>PayloadRemovalDisallowed</key>
    <false/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>$UUID2</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>
MOBILECONFIG_EOF

    echo -e "${GREEN}  ✓ Certificates prepared (.crt, .pem, .cer, .mobileconfig)${NC}"
else
    echo -e "${YELLOW}⚠ Could not find mkcert root CA${NC}"
fi

echo ""
echo -e "${GREEN}✅ Extended setup complete!${NC}"
echo ""
echo "📋 Next steps:"
echo "  1. Run: make dev-extended"
echo "  2. Open: https://qoomb.localhost:8443"
echo ""
echo "💡 Note: qoomb.localhost automatically resolves to 127.0.0.1 (no /etc/hosts needed!)"
echo ""
echo "📱 To test on mobile devices in your network:"
echo "  - Your local IP: ${LOCAL_IP}"
echo "  - Open https://${LOCAL_IP}:8443 on your mobile device"
echo "  - Make sure your phone is on the same WiFi network"
echo ""
echo "📱 Mobile certificate installation:"
echo "  - Certificate server runs automatically on http://${LOCAL_IP}:8888"
echo "  - Click 'Setup' button in footer → Scan QR code → Install certificate"
echo "  - Works with any browser (Safari, Chrome, Firefox, etc.)"
echo ""
echo "ℹ️  Note: Using port 8443 (no sudo/password needed)"
echo ""
