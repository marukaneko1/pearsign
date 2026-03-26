import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pearsign.app',
  appName: 'PearSign',
  webDir: 'capacitor-web',
  server: {
    url: 'https://pearsign.replit.app',
    cleartext: false,
  },
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
