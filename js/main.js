/**
 * @file main.js
 * Composition root. Wires storage -> repositories -> managers -> audio ->
 * router -> screens, then boots the app. This is the only file that
 * imports and instantiates everything; every other module receives its
 * dependencies via constructor/factory arguments.
 */
import { LocalStorageProvider } from './core/storage/LocalStorageProvider.js';
import { StorageKeys } from './core/storage/StorageKeys.js';
import { defaultMeta } from './core/data/schema.js';
import { ProfileRepository } from './core/data/ProfileRepository.js';
import { SettingsRepository } from './core/data/SettingsRepository.js';
import { eventBus } from './core/events/EventBus.js';
import { ScreenManager } from './core/router/ScreenManager.js';

import { ProfileManager } from './profiles/ProfileManager.js';
import { SoundManager } from './audio/SoundManager.js';

import { mountMuteToggle } from './ui/MuteToggle.js';
import { showToast } from './ui/Toast.js';
import { burst } from './juice/Confetti.js';

import { createProfileSelectScreen } from './screens/profile-select/ProfileSelectScreen.js';
import { createProfileCreateScreen } from './screens/profile-create/ProfileCreateScreen.js';
import { createWorldMapScreen } from './screens/world-map/WorldMapScreen.js';
import { createStationScreen } from './screens/station/PlaceholderStationScreen.js';
import { createMyWorldScreen } from './screens/my-world/MyWorldScreen.js';

import { logger } from './utils/logger.js';

async function bootstrap() {
  const storageProvider = new LocalStorageProvider();

  if (!storageProvider.isPersistent) {
    showToast('השמירה זמנית בלבד במכשיר הזה. ההתקדמות לא תישמר אחרי סגירת הדפדפן.', {
      variant: 'warning',
      duration: 5000,
    });
  }

  const meta = await storageProvider.getItem(StorageKeys.META);
  if (!meta) {
    await storageProvider.setItem(StorageKeys.META, defaultMeta());
  }

  const profileRepository = new ProfileRepository(storageProvider);
  const settingsRepository = new SettingsRepository(storageProvider);

  const settings = await settingsRepository.get();
  const soundManager = new SoundManager(settings.muted, settingsRepository, eventBus);

  const profileManager = new ProfileManager(profileRepository, storageProvider, eventBus);
  await profileManager.init();

  const overlayRoot = document.getElementById('overlay-root');
  mountMuteToggle(overlayRoot, soundManager, eventBus);

  eventBus.on('profile:created', () => burst(document.body));

  const screenRoot = document.getElementById('screen-root');
  const screenManager = new ScreenManager(screenRoot);

  screenManager.register('#/profiles', createProfileSelectScreen(profileManager, soundManager, screenManager));
  screenManager.register('#/create-profile', createProfileCreateScreen(profileManager, soundManager, screenManager));
  screenManager.register('#/map', createWorldMapScreen(profileManager, soundManager, screenManager));
  screenManager.register('#/station/:id', createStationScreen(profileManager, soundManager, screenManager));
  screenManager.register('#/my-world', createMyWorldScreen(profileManager, soundManager, screenManager));

  const hasActiveProfile = Boolean(profileManager.getActiveProfile());
  screenManager.setDefaultHash(hasActiveProfile ? '#/map' : '#/profiles');

  if (!window.location.hash) {
    window.location.hash = hasActiveProfile ? '#/map' : '#/profiles';
  }

  screenManager.start();

  logger.info('המסע לכוכב א׳ — Stage 1 ready.');
}

bootstrap().catch((err) => {
  logger.error('Fatal error during bootstrap', err);
  const screenRoot = document.getElementById('screen-root');
  if (screenRoot) {
    screenRoot.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;text-align:center;padding:2rem;font-family:'Segoe UI',Arial,sans-serif;">
        <div style="font-size:4rem;">🙈</div>
        <h1>אופס, קרתה תקלה קטנה</h1>
        <p>נסו לרענן את הדף. אם זה ממשיך לקרות, ספרו למבוגר אחראי.</p>
      </div>`;
  }
});
