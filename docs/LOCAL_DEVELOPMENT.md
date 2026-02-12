# Extended Development Setup with qoomb.localhost

This guide explains how to set up the **extended development environment** with HTTPS and local domain. This is optional but recommended for mobile/PWA testing and provides a production-like environment.

## Why qoomb.localhost?

The `qoomb.localhost` setup provides several benefits for **all development** (not just mobile):

1. **No CORS issues** - Everything runs under one domain
2. **HTTPS support** - Required for PWA features (service workers, push notifications)
3. **Trusted certificates** - No browser security warnings
4. **Production-like** - Same setup as production environment
5. **Easy mobile testing** - Just open `https://qoomb.localhost:8443` on any device on your network
6. **Instant DNS resolution** - `.localhost` is RFC standard, resolves to 127.0.0.1 without mDNS lookup (no 5-second delay)

## Architecture

```
Your Device (Phone/Laptop)
         ↓
   https://qoomb.localhost:8443
         ↓
   Caddy Reverse Proxy
         ↓
    ┌────────────────┬─────────────────┐
    ↓                ↓                 ↓
Frontend        Backend API        tRPC
(Vite)         (NestJS)        (NestJS)
:5173            :3001            :3001
```

**How it works:**

- Caddy acts as a reverse proxy
- `https://qoomb.localhost:8443` → Frontend (Vite dev server)
- `https://qoomb.localhost:8443/api/*` → Backend API
- `https://qoomb.localhost:8443/trpc/*` → tRPC endpoints
- SSL certificates generated with mkcert (trusted by your OS)

## Prerequisites

This extended setup requires **macOS or Linux** with:

- Homebrew (macOS) or package manager (Linux)
- Ability to install system certificates (mkcert)

**For Windows users:** Use the standard `make dev` instead.

## Setup (One-Time)

### Step 1: Standard Setup

First, run the standard setup:

```bash
make setup
```

### Step 2: Add Extended Features

Then add HTTPS and local domain:

```bash
make setup-extended
```

This will:

- Install Caddy reverse proxy
- Install mkcert for SSL certificates
- Generate certificates for qoomb.localhost

**Note:** No /etc/hosts modification needed! The `.localhost` TLD automatically resolves to 127.0.0.1 per RFC standards.

### Verify setup

After setup completes, verify:

```bash
# Check if Caddy is installed
caddy version

# Check if certificates exist
ls -la certs/

# Test DNS resolution (should be instant!)
ping qoomb.localhost
```

## Daily Development

### Standard Development (recommended for most work)

```bash
make dev
```

Access your app at:

- **Frontend:** <http://localhost:5173>
- **Backend API:** <http://localhost:3001>

### Extended Development (for mobile/PWA testing)

```bash
make dev-extended
```

Access your app at:

- **Frontend:** <https://qoomb.localhost:8443>
- **Backend API:** <https://qoomb.localhost:8443/api>
- **tRPC:** <https://qoomb.localhost:8443/trpc>

This will:

1. Start Docker services (PostgreSQL, Redis)
2. Start Caddy reverse proxy with HTTPS
3. Start both frontend and backend development servers

### Stop the services

Press `Ctrl+C` to stop the development servers, then:

```bash
make stop-extended # Stop Caddy (if using extended mode)
make docker-down   # Stop Docker services
```

## Mobile Device Testing

### Prerequisites

- Your mobile device must be on the **same WiFi network** as your development machine
- Your firewall must allow incoming connections on port 8443

### iOS (iPhone/iPad)

1. Open Safari on your iOS device
2. Navigate to `https://qoomb.localhost:8443`
3. You may see a certificate warning on first visit
4. Go to Settings → General → About → Certificate Trust Settings
5. Enable full trust for the mkcert CA certificate

### Android

1. Open Chrome on your Android device
2. Navigate to `https://qoomb.localhost:8443`
3. You may see a certificate warning
4. Click "Advanced" → "Proceed to qoomb.localhost (unsafe)"
5. The certificate will be trusted after first visit

### Troubleshooting Mobile Access

If `qoomb.localhost` doesn't work on mobile:

1. **Check network connectivity**

   ```bash
   # Get your local IP
   ipconfig getifaddr en0  # macOS
   ```

2. **Try accessing via IP directly**
   - On your phone, try: `https://<your-ip>:5173`

3. **Check firewall**

   ```bash
   # macOS - allow incoming connections
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/caddy
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblock /usr/local/bin/caddy
   ```

4. **Ensure mDNS/Bonjour is working**
   - macOS has mDNS built-in (`.local` domains work automatically)
   - Your router may block mDNS - check router settings

## Environment Configuration

The local development setup uses `.env.local`, which is automatically loaded by both Vite and NestJS.

Key differences from `.env`:

```bash
# .env - Standard development
VITE_API_URL="http://localhost:3001"
ALLOWED_ORIGINS="http://localhost:5173"

# .env.local - qoomb.localhost development
VITE_API_URL="https://qoomb.localhost:8443"
ALLOWED_ORIGINS="https://qoomb.localhost:8443"
```

## PWA Testing

With `qoomb.localhost`, you can test PWA features that require HTTPS:

1. **Service Worker** - Offline caching
2. **Install Prompt** - Add to Home Screen
3. **Push Notifications** - Background notifications
4. **Web Share API** - Share content to other apps

### Test PWA Installation

**Desktop (Chrome/Edge):**

1. Open https://qoomb.localhost:8443
2. Look for the install icon in the address bar
3. Click to install the PWA

**Mobile (iOS Safari):**

1. Open https://qoomb.localhost:8443 in Safari
2. Tap the Share button
3. Select "Add to Home Screen"

**Mobile (Android Chrome):**

1. Open https://qoomb.localhost:8443 in Chrome
2. Tap the menu (three dots)
3. Select "Add to Home Screen" or "Install App"

## Capacitor Mobile App Testing

For testing the native iOS/Android wrapper:

```bash
# Build the web app
cd apps/mobile
pnpm run build

# Open in Xcode (iOS)
npx cap open ios

# Open in Android Studio
npx cap open android
```

The mobile apps will use the same `.env.local` configuration.

## Troubleshooting

### "Caddy not found"

```bash
# Install Caddy manually
brew install caddy
```

### "Certificate not trusted"

```bash
# Reinstall mkcert CA
mkcert -install

# Regenerate certificates
cd certs
rm *.pem
mkcert qoomb.localhost "*.qoomb.localhost" localhost 127.0.0.1 ::1
```

### "Port 8443 already in use"

```bash
# Check what's using port 8443
lsof -i :8443

# If it's another Caddy instance
caddy stop
```

### "qoomb.localhost not resolving"

This should never happen! The `.localhost` TLD is an RFC standard and automatically resolves to 127.0.0.1.

If you're experiencing DNS issues:

```bash
# Test DNS resolution
ping qoomb.localhost
# Should resolve instantly to 127.0.0.1

# If it doesn't work, check if you're using a custom DNS server that blocks .localhost
# In that case, you can add to /etc/hosts as a fallback:
echo "127.0.0.1 qoomb.localhost api.qoomb.localhost" | sudo tee -a /etc/hosts
```

### "WebSocket connection failed" (Vite HMR)

This usually means Caddy isn't proxying WebSocket connections properly. Check Caddyfile.dev:

```caddy
reverse_proxy localhost:5173 {
    # This header is required for WebSocket support
    header_up X-Forwarded-Proto {scheme}
}
```

## Advanced Configuration

### Custom Domain

To use a different domain (e.g., `myapp.local`):

1. Update `Caddyfile.dev`:

   ```caddy
   myapp.local {
       tls ./certs/myapp.local.pem ./certs/myapp.local-key.pem
       # ... rest of config
   }
   ```

2. Generate certificates:

   ```bash
   cd certs
   mkcert myapp.local "*.myapp.local"
   ```

3. Update `/etc/hosts`:

   ```bash
   echo "127.0.0.1 myapp.local" | sudo tee -a /etc/hosts
   ```

4. Update `.env.local`:
   ```bash
   VITE_API_URL="https://myapp.local"
   ALLOWED_ORIGINS="https://myapp.local"
   ```

## Security Notes

- **mkcert certificates are for local development only**
- Never commit `.env.local` or `certs/` to version control (already in `.gitignore`)
- The mkcert CA certificate is installed system-wide - be cautious on shared machines
- **Port 8443 used instead of 443** - No sudo/elevated privileges needed

## Comparison: Development Modes

| Feature              | Standard (`make dev`)        | Extended (`make dev-extended`)     |
| -------------------- | ---------------------------- | ---------------------------------- |
| **Frontend URL**     | <http://localhost:5173>      | <https://qoomb.localhost:8443>     |
| **Backend URL**      | <http://localhost:3001>      | <https://qoomb.localhost:8443/api> |
| **HTTPS**            | ❌ No                        | ✅ Yes (mkcert)                    |
| **CORS**             | ⚠️ Configured                | ✅ Not needed (same domain)        |
| **Mobile Testing**   | ❌ Difficult                 | ✅ Easy                            |
| **PWA Features**     | ⚠️ Limited                   | ✅ Full support                    |
| **Platform Support** | ✅ All (Windows/macOS/Linux) | ⚠️ macOS/Linux only                |
| **Setup Complexity** | Minimal                      | Moderate                           |
| **Best for**         | Most development             | Mobile/PWA testing                 |

## When to Use What

**Use `make dev` (standard - recommended) when:**

- Doing regular development work
- Developing backend features
- Writing database migrations
- Quick iteration on code
- Working on Windows
- You don't need HTTPS/PWA features

**Use `make dev-extended` (optional) when:**

- Testing PWA features
- Testing on mobile devices
- Testing service workers
- Testing push notifications
- Demoing to stakeholders on their devices
- You need a production-like HTTPS environment

## Resources

- [mkcert](https://github.com/FiloSottile/mkcert) - Local CA and certificates
- [Caddy](https://caddyserver.com/) - Reverse proxy with automatic HTTPS
- [Vite PWA Plugin](https://vite-pwa-org.netlify.app/) - PWA configuration
- [Capacitor](https://capacitorjs.com/) - Native mobile wrapper

## Summary

The extended development setup with qoomb.localhost provides an **optional** production-like environment with HTTPS for mobile/PWA testing. Most development can be done with the standard `make dev` setup.

**Standard Development (recommended):**

```bash
# One-time setup
make setup

# Daily development
make dev

# Access at http://localhost:5173
```

**Extended Development (optional):**

```bash
# After standard setup, add extended features
make setup-extended

# Use extended mode when needed
make dev-extended

# Access at https://qoomb.localhost:8443 (also works on mobile devices)
```

**Platform Support:**

- Standard mode: ✅ Works on **all platforms** (Windows, macOS, Linux)
- Extended mode: ⚠️ Requires **macOS or Linux** (uses Homebrew/mkcert)
