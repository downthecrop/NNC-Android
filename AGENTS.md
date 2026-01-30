# Android Client Setup Guide

## Prerequisites

- Android Studio with an emulator running (or physical Android device connected via ADB)
- Node.js and npm installed
- Docker with the NotNextCloud2 server container running

## Setup Instructions

### 1. Verify Server Container is Running

First, ensure the NotNextCloud2 server container is running:

```bash
docker ps
```

Look for a container named similar to `notnextcloud2-local-cloud` running on port 4170.

### 2. Install Dependencies

Navigate to the Android client directory and install dependencies:

```bash
cd clients/android
npm install
```

### 3. Check for Android Emulator

Verify that you have an Android emulator running or a physical device connected:

```bash
adb devices
```

You should see at least one device listed with status "device".

### 4. Run the Android App

Set the API URL environment variable and run the app:

```bash
# For Android emulator (uses 10.0.2.2 to reach host machine)
EXPO_PUBLIC_API_URL=http://10.0.2.2:4170 npm run android

# For physical device on same network, use your computer's IP address:
# EXPO_PUBLIC_API_URL=http://YOUR_IP_ADDRESS:4170 npm run android
```

## Troubleshooting

### Common Issues

1. **Network Connection Issues**
   - When running on Android emulator, use `http://10.0.2.2:4170` as the server URL
   - When running on physical device, use your computer's local IP address (e.g., `http://192.168.x.x:4170`)

2. **App Won't Connect to Server**
   - Verify the server container is running: `docker ps`
   - Check that port 4170 is accessible: `curl http://localhost:4170`
   - Ensure firewall isn't blocking connections

3. **ADB Device Not Found**
   - Start Android Studio and launch an emulator
   - Or enable USB debugging on your physical device and connect via USB

4. **Dependency Issues**
   - Clear npm cache: `npm cache clean --force`
   - Delete node_modules and reinstall: `rm -rf node_modules && npm install`

### Useful Commands

```bash
# Start Expo development server separately
EXPO_PUBLIC_API_URL=http://10.0.2.2:4170 npx expo start

# Open Metro bundler interface
EXPO_PUBLIC_API_URL=http://10.0.2.2:4170 npx expo start --dev-client

# Build for production
npx expo run:android
```

## Development Notes

- The app uses Expo Router for navigation
- Authentication tokens are stored securely using `expo-secure-store`
- The app expects the backend server to be available at the configured API URL
- For development, ensure the server container is accessible from the Android device/emulator