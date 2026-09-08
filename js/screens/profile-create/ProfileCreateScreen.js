/**
 * @file ProfileCreateScreen.js
 * Name input + avatar picker grid. Validation is always gentle Hebrew
 * copy, never a harsh red error, per the "zero frustration" tone.
 */
import { createElement, createImageWithFallback } from '../../utils/dom.js';
import { AvatarCatalog } from '../../profiles/AvatarCatalog.js';

/**
 * @param {import('../../profiles/ProfileManager.js').ProfileManager} profileManager
 * @param {import('../../audio/SoundManager.js').SoundManager} soundManager
 * @param {import('../../core/router/ScreenManager.js').ScreenManager} screenManager
 */
export function createProfileCreateScreen(profileManager, soundManager, screenManager) {
  let container = null;
  let selectedAvatarId = null;
  let hintEl = null;
  let nameInput = null;
  let panelEl = null;

  function mount(rootEl) {
    container = rootEl;
    selectedAvatarId = null;

    const screen = createElement('div', { classes: 'profile-create' });
    screen.append(createElement('h1', { text: 'בואו ניצור פרופיל!' }));

    const panel = createElement('div', { classes: 'profile-create__panel' });
    panelEl = panel;

    const nameLabel = createElement('label', {
      classes: 'profile-create__label',
      attrs: { for: 'profile-name-input' },
      text: 'איך קוראים לך?',
    });
    nameInput = createElement('input', {
      classes: 'profile-create__input',
      attrs: {
        id: 'profile-name-input',
        type: 'text',
        placeholder: 'לדוגמה: נועה',
        maxlength: '20',
        autocomplete: 'off',
      },
    });

    const avatarLabel = createElement('h3', { classes: 'profile-create__label', text: 'בחרו דמות' });
    const avatarGrid = createElement('div', { classes: 'avatar-picker' });

    for (const avatar of AvatarCatalog) {
      avatarGrid.append(createAvatarOption(avatar, avatarGrid));
    }

    const createBtn = createElement('button', {
      classes: 'btn btn-primary btn-large',
      attrs: { type: 'button' },
      text: 'צור פרופיל',
    });
    createBtn.addEventListener('click', () => handleCreate());

    const backBtn = createElement('button', {
      classes: 'btn btn-ghost',
      attrs: { type: 'button' },
      text: 'ביטול',
    });
    backBtn.addEventListener('click', () => {
      soundManager.playEffect('click');
      screenManager.navigate('#/profiles');
    });

    panel.append(
      nameLabel,
      nameInput,
      avatarLabel,
      avatarGrid,
      createElement('div', { classes: 'profile-create__actions' }, [createBtn, backBtn])
    );

    screen.append(panel);
    container.append(screen);

    window.setTimeout(() => soundManager.speak('בואו ניצור פרופיל. איך קוראים לך, ואיזו דמות תרצו?'), 250);
  }

  function createAvatarOption(avatar, grid) {
    const option = createElement('button', {
      classes: 'avatar-option',
      attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': avatar.labelHe },
    });

    const avatarWrap = createElement('div', { classes: 'avatar avatar--md' });
    avatarWrap.append(
      createImageWithFallback({ src: avatar.imagePath, alt: avatar.labelHe, emoji: avatar.fallbackEmoji })
    );

    option.append(avatarWrap, createElement('span', { classes: 'avatar-option__label', text: avatar.labelHe }));

    option.addEventListener('click', () => {
      soundManager.playEffect('click');
      selectedAvatarId = avatar.id;
      for (const el of grid.querySelectorAll('.avatar-option')) {
        el.setAttribute('aria-pressed', 'false');
      }
      option.setAttribute('aria-pressed', 'true');
      clearHint();
    });

    return option;
  }

  function showHint(message) {
    clearHint();
    hintEl = createElement('p', { classes: 'profile-create__hint', text: message });
    panelEl.insertBefore(hintEl, panelEl.querySelector('.profile-create__actions'));
  }

  function clearHint() {
    hintEl?.remove();
    hintEl = null;
  }

  async function handleCreate() {
    const name = nameInput.value.trim();

    if (!name) {
      showHint('כמעט! נשאר רק לכתוב איך קוראים לכם 😊');
      soundManager.playEffect('pop');
      return;
    }

    if (!selectedAvatarId) {
      showHint('עוד רגע! בחרו דמות שתלווה אתכם במסע 🌟');
      soundManager.playEffect('pop');
      return;
    }

    soundManager.playEffect('success');
    const profile = await profileManager.createProfile(name, selectedAvatarId);
    await profileManager.selectProfile(profile.id);
    soundManager.speak(`יופי, ${name}! הפרופיל שלך מוכן.`);
    window.setTimeout(() => screenManager.navigate('#/map'), 900);
  }

  function unmount() {
    container?.replaceChildren();
    container = null;
    hintEl = null;
    nameInput = null;
    panelEl = null;
  }

  return { mount, unmount };
}
