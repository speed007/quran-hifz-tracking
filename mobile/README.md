# Qur'an Hifz Tracker — Android app (Expo / React Native)

A native Android companion app for the [Qur'an Hifz Tracker](../README.md) backend. It uses the
same REST API as the web frontend and logs in with a bearer token instead of a browser cookie.

## Requirements

- The backend must be running and reachable from the phone over HTTPS (or over your LAN for dev).
  The web UI must already work on your phone, or your server must have a public URL
  (e.g. via cloudflared on the VM).
- Node.js + pnpm.

## Setup

```sh
cd mobile
pnpm install
cp .env.example .env
```

Edit `.env` and point `EXPO_PUBLIC_API_URL` at your backend, e.g.:

```sh
EXPO_PUBLIC_API_URL=https://hifz.yourdomain.example
```

For local development against a dev server on your LAN, use the machine's LAN IP:

```sh
EXPO_PUBLIC_API_URL=http://192.168.1.10:5101
```

## Run

```sh
npx expo start
```

Then scan the QR code with the **Expo Go** app on your phone (Android). The app connects to
whatever server `EXPO_PUBLIC_API_URL` points at, so a fresh start of the dev server is only
needed if you change that value.

## Build a standalone APK

The project targets Expo SDK 57 with the Expo managed workflow.

- Development build: `npx expo run:android`
- Release build: use EAS — `npx eas build -p android --profile preview` produces an
  installable `.apk`; `--profile production` produces a Play Store AAB.

## Notes

- Sessions use the bearer token from `POST /api/auth/mobile-login` (added to the backend in
  `ebdc58d`); the token is stored in AsyncStorage and sent as an `Authorization: Bearer` header.
- Dark/light theme preference is stored on-device.
- The backend must be deployed with the latest code (`git pull && docker compose up -d --build`)
  for the mobile login endpoint to exist.
