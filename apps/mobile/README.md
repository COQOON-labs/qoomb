# Qoomb Mobile App

Native iOS and Android wrapper for the Qoomb web application using Capacitor.

## Prerequisites

- Node.js >= 24
- pnpm >= 10
- For iOS: Xcode 15+ and CocoaPods
- For Android: Android Studio with SDK 34+

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Build the web app

```bash
pnpm build
```

### 3. Add native platforms

```bash
# Add iOS platform
pnpm add:ios

# Add Android platform
pnpm add:android
```

### 4. Sync web assets to native projects

```bash
pnpm sync
```

## Development

### Open in IDE

```bash
# Open Xcode
pnpm open:ios

# Open Android Studio
pnpm open:android
```

### Run on device/simulator

```bash
# Run on iOS simulator
pnpm run:ios

# Run on Android emulator
pnpm run:android
```

### Development with live reload

For development with hot reload, uncomment the `server.url` in `capacitor.config.ts`:

```typescript
server: {
  url: 'http://YOUR_LOCAL_IP:5173',
  cleartext: true,
}
```

Then:

1. Start the web dev server: `pnpm dev`
2. Run on device: `pnpm run:ios` or `pnpm run:android`

## Project Structure

```
apps/mobile/
├── capacitor.config.ts  # Capacitor configuration
├── package.json         # Mobile-specific dependencies
├── ios/                 # iOS native project (after cap add ios)
└── android/             # Android native project (after cap add android)
```

## Native Features

The following Capacitor plugins are pre-configured:

- **@capacitor/app**: App lifecycle, URL handling
- **@capacitor/haptics**: Haptic feedback
- **@capacitor/keyboard**: Keyboard control
- **@capacitor/preferences**: Key-value storage
- **@capacitor/push-notifications**: Push notifications
- **@capacitor/splash-screen**: Native splash screen
- **@capacitor/status-bar**: Status bar styling

## Building for Release

### iOS

1. Open in Xcode: `pnpm open:ios`
2. Select your team in Signing & Capabilities
3. Archive for distribution

### Android

1. Open in Android Studio: `pnpm open:android`
2. Build > Generate Signed Bundle/APK
3. Follow the signing wizard

## Troubleshooting

### iOS build fails with CocoaPods error

```bash
cd ios && pod install --repo-update
```

### Android: Gradle sync fails

- Ensure Android Studio has the correct SDK installed
- Check `android/variables.gradle` for correct versions
