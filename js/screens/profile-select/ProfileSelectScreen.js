/**
 * @file ProfileSelectScreen.js
 * Lists existing profiles as cards; "+ פרופיל חדש" card creates a new one;
 * tapping a profile selects it and navigates to the map. A small delete
 * icon per card opens a gentle (non-scary) confirm modal.
 */
import { createElement, createImageWithFallback, clearElement } from '../../utils/dom.js';
import { getAvatarImageSources } from '../../profiles/AvatarCatalog.js';
import { confirmModal } from '../../ui/Modal.js';
import { showToast } from '../../ui/Toast.js';

/**
 * @param {import('../../profiles/ProfileManager.js').ProfileManager} profileManager
 * @param {import('../../audio/SoundManager.js').SoundManager} soundManager
 * @param {import('../../core/router/ScreenManager.js').ScreenManager} screenManager
 */
export function createProfileSelectScreen(profileManager, soundManager, screenManager) {
  let container = null;

  async function mount(rootEl) {
    container = rootEl;
    const screen = createElement('div', { classes: 'profile-select' });
    screen.append(
      createElement('h1', { classes: 'profile-select__title', text: 'מי משחק היום?' }),
      createElement('p', { classes: 'profile-select__subtitle', text: 'בחרו את הפרופיל שלכם, או צרו פרופיל חדש' })
    );

    const grid = createElement('div', { classes: 'profile-select__grid' });
    screen.append(grid);
    container.append(screen);

    await renderGrid(grid);

    window.setTimeout(() => soundManager.speak('מי משחק היום? בחרו פרופיל'), 250);
  }

  async function renderGrid(grid) {
    clearElement(grid);
    const profiles = await profileManager.listProfiles();

    for (const profile of profiles) {
      grid.append(createProfileCard(profile, grid));
    }

    grid.append(createAddCard(grid));
  }

  function createProfileCard(profile, grid) {
    // A plain <button> cannot legally contain another interactive element
    // (the delete button), so the card itself is a div acting as a button
    // via role="button" + tabindex, with its own Enter/Space handling.
    const card = createElement('div', {
      classes: 'card profile-card',
      attrs: { role: 'button', tabindex: '0', 'aria-label': `שחק בתור ${profile.name}` },
    });

    const avatarWrap = createElement('div', { classes: 'avatar avatar--lg' });
    avatarWrap.append(createImageWithFallback({ ...getAvatarImageSources(profile), alt: profile.name }));

    const deleteBtn = createElement('button', {
      classes: 'profile-card__delete',
      attrs: { type: 'button', 'aria-label': `מחק את הפרופיל של ${profile.name}` },
      text: '🗑️',
    });

    const onDelete = async (e) => {
      e.stopPropagation();
      soundManager.playEffect('click');
      const confirmed = await confirmModal({
        icon: '🧸',
        title: `למחוק את הפרופיל של ${profile.name}?`,
        message: 'כל ההתקדמות והפרסים של הפרופיל הזה יימחקו. אפשר תמיד ליצור פרופיל חדש.',
        confirmLabel: 'כן, למחוק',
        cancelLabel: 'לא, תשאירו',
      });
      if (confirmed) {
        await profileManager.deleteProfile(profile.id);
        showToast(`הפרופיל של ${profile.name} נמחק`);
        await renderGrid(grid);
      }
    };

    deleteBtn.addEventListener('click', onDelete);

    card.append(avatarWrap, createElement('span', { classes: 'profile-card__name', text: profile.name }), deleteBtn);

    const selectProfile = async () => {
      soundManager.playEffect('pop');
      await profileManager.selectProfile(profile.id);
      screenManager.navigate('#/map');
    };

    card.addEventListener('click', selectProfile);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectProfile();
      }
    });

    return card;
  }

  function createAddCard() {
    const card = createElement('div', {
      classes: 'card profile-card profile-card--add',
      attrs: { role: 'button', tabindex: '0', 'aria-label': 'צור פרופיל חדש' },
    });
    card.append(
      createElement('span', { classes: 'profile-card__plus', attrs: { 'aria-hidden': 'true' }, text: '+' }),
      createElement('span', { classes: 'profile-card__name', text: 'פרופיל חדש' })
    );

    const goCreate = () => {
      soundManager.playEffect('click');
      screenManager.navigate('#/create-profile');
    };

    card.addEventListener('click', goCreate);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goCreate();
      }
    });

    return card;
  }

  function unmount() {
    container?.replaceChildren();
    container = null;
  }

  return { mount, unmount };
}
