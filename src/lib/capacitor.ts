import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();

export async function initCapacitor() {
  if (!isNative) return;

  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    const { Keyboard } = await import('@capacitor/keyboard');
    const { SplashScreen } = await import('@capacitor/splash-screen');

    if (platform === 'ios') {
      await StatusBar.setStyle({ style: 'default' as any });
    }

    Keyboard.addListener('keyboardWillShow', (info) => {
      document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
    });

    Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.style.setProperty('--keyboard-height', '0px');
    });

    await SplashScreen.hide();
  } catch (e) {
    console.warn('Capacitor plugin init error:', e);
  }
}
