import type { CapacitorConfig } from '@capacitor/cli';

// In production builds no `server` block is set — the app loads its own bundled
// web assets from `webDir`. Set CAPACITOR_SERVER_URL only for local live-reload
// during development (e.g. pointing at a dev tunnel or Replit preview URL).
const devServer = process.env.CAPACITOR_SERVER_URL
  ? { url: process.env.CAPACITOR_SERVER_URL, cleartext: false }
  : undefined;

const config: CapacitorConfig = {
  appId: 'com.pearsign.app',
  appName: 'PearSign',
  webDir: 'capacitor-web',
  ...(devServer ? { server: devServer } : {}),
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#3565d4',
      showSpinner: false,
    },
    StatusBar: {
      style: 'default',
      backgroundColor: '#3565d4',
    },
    Keyboard: {
      resize: 'native' as any,
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'PearSign',
  },
  android: {
    backgroundColor: '#ffffff',
  },
};

export default config;
