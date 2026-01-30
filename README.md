# NNC Android (Expo)

React Native client for NotNextCloud2, built with Expo and Expo Router.

## Quick start

- Install dependencies: `npm install`
- Run locally: `npm run start`
- Set server URL: export `EXPO_PUBLIC_API_URL` or add it to `.env`

Example:
```
EXPO_PUBLIC_API_URL=http://192.168.1.10:4170
```

## Tabs
- Files
- Photos
- Music
- Settings

## Auth
- Login via `/api/login`
- Tokens stored in `expo-secure-store`
