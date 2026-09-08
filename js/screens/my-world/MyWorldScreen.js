/**
 * @file MyWorldScreen.js
 * "הדמות שלי / העולם שלי" — lets the child view and use the outfit /
 * accessory / furniture rewards earned across the 7 learning stations
 * (spec section 3). Registered as a top-level route (#/my-world) in
 * main.js, following the same
 * createXScreen(profileManager, soundManager, screenManager) factory
 * pattern as every other top-level screen (world-map, profile-select, ...) —
 * see js/core/router/ScreenManager.js for the mount/unmount contract.
 *
 * The equipped OUTFIT genuinely changes the portrait: getAvatarImageSources()
 * (AvatarCatalog.js) swaps in a real pre-generated "avatar wearing this
 * outfit" image per (avatarId, outfitId) pair (24 combinations total — 6
 * avatars × 4 outfits) when one is equipped, falling back to the base
 * avatar portrait, then the emoji, via createImageWithFallback's
 * multi-source fallback chain. ACCESSORIES still show as small adjacent
 * badges next to the portrait rather than layered onto it — there's no
 * feasible way to pre-generate every outfit×accessory×slot combination
 * (the combinatorics explode fast), so that stays an intentional, honest
 * simplification given the current art-generation approach (one-shot
 * text-to-image, not a rigged/layerable character).
 */
import { createElement, clearElement, createImageWithFallback } from '../../utils/dom.js';
import { getAvatarImageSources } from '../../profiles/AvatarCatalog.js';
import { OUTFIT_ITEMS, FURNITURE_ITEMS, MAP_THEME_ITEMS } from '../../rewards/rewardCatalog.js';
import { ALL_CATEGORY_KEYS, CategoryLabelsHe } from '../../learning/categories.js';
import { showToast } from '../../ui/Toast.js';

/**
 * @param {import('../../profiles/ProfileManager.js').ProfileManager} profileManager
 * @param {import('../../audio/SoundManager.js').SoundManager} soundManager
 * @param {import('../../core/router/ScreenManager.js').ScreenManager} screenManager
 */
export function createMyWorldScreen(profileManager, soundManager, screenManager) {
  let container = null;

  // DOM refs kept so an equip/placement change can refresh just the
  // affected visual state instead of remounting the whole screen.
  let badgeRowEl = null;
  let avatarWrapEl = null;
  let outfitGridEl = null;
  let furnitureGridEl = null;
  let mapThemeGridEl = null;
  let roomPreviewEl = null;

  /** id of the item most recently tapped, so its card gets the "pop" juice on next render only. */
  let lastToggledItemId = null;

  /** For the cursor-sparkle trail below — throttling + cleanup state. */
  let sparkleScreenEl = null;
  let lastSparkleAt = 0;

  function mount(rootEl) {
    container = rootEl;
    const profile = profileManager.getActiveProfile();

    if (!profile) {
      screenManager.navigate('#/profiles');
      return;
    }

    renderAll(profile);
  }

  function unmount() {
    detachCursorSparkles();
    container?.replaceChildren();
    container = null;
    badgeRowEl = null;
    avatarWrapEl = null;
    outfitGridEl = null;
    furnitureGridEl = null;
    mapThemeGridEl = null;
    roomPreviewEl = null;
    lastToggledItemId = null;
  }

  // ---- Full render ----

  function renderAll(profile) {
    clearElement(container);

    const screen = createElement('div', { classes: 'my-world' });
    screen.append(buildHeader(), buildCharacterSection(profile), buildMedalsSection(profile), buildWorldSection(profile));
    container.append(screen);
    attachCursorSparkles(screen);
  }

  // ---- Cursor-sparkle trail: a little star pops where the pointer moves,
  // on this screen only (not the whole game) — playful, decorative, no
  // game state involved. Throttled by time so a fast swipe across the
  // screen doesn't flood the DOM with hundreds of stars in one gesture;
  // skipped entirely under prefers-reduced-motion like every other
  // decorative effect in this project. ----

  const SPARKLE_MIN_INTERVAL_MS = 90;
  const SPARKLE_COLORS = ['#ff6b4a', '#ff4fa3', '#8b5cf6', '#26c6da', '#ffc72c'];
  const SPARKLE_GLYPHS = ['✦', '⭐', '✨'];

  function attachCursorSparkles(screen) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    sparkleScreenEl = screen;
    sparkleScreenEl.addEventListener('pointermove', handleCursorMove);
  }

  function detachCursorSparkles() {
    sparkleScreenEl?.removeEventListener('pointermove', handleCursorMove);
    sparkleScreenEl = null;
  }

  function handleCursorMove(event) {
    const now = performance.now();
    if (now - lastSparkleAt < SPARKLE_MIN_INTERVAL_MS) return;
    lastSparkleAt = now;
    spawnCursorSparkle(event.clientX, event.clientY);
  }

  function spawnCursorSparkle(x, y) {
    const star = createElement('span', {
      classes: 'my-world__cursor-star',
      attrs: { 'aria-hidden': 'true' },
      text: SPARKLE_GLYPHS[Math.floor(Math.random() * SPARKLE_GLYPHS.length)],
    });
    star.style.left = `${x}px`;
    star.style.top = `${y}px`;
    star.style.color = SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)];
    star.style.setProperty('--star-drift', `${Math.round((Math.random() - 0.5) * 40)}px`);
    document.body.append(star);
    window.setTimeout(() => star.remove(), 700);
  }

  function buildHeader() {
    const header = createElement('header', { classes: 'my-world__header' });

    const backBtn = createElement('button', {
      classes: 'btn btn-ghost my-world__back',
      attrs: { type: 'button' },
      text: 'בחזרה למפה',
    });
    backBtn.addEventListener('click', () => {
      soundManager.playEffect('click');
      navigateToMap();
    });

    const title = createElement('h1', { classes: 'my-world__title', text: 'הדמות שלי והעולם שלי' });

    header.append(backBtn, title);
    return header;
  }

  function navigateToMap() {
    if (screenManager) {
      screenManager.navigate('#/map');
    } else {
      window.location.hash = '#/map';
    }
  }

  // ---- Section 1: "הדמות שלי" ----

  function buildCharacterSection(profile) {
    const section = createElement('section', {
      classes: ['my-world__section', 'my-world__section--character'],
      attrs: { 'aria-labelledby': 'my-world-character-title' },
    });
    section.append(
      createElement('h2', {
        classes: 'my-world__section-title',
        attrs: { id: 'my-world-character-title' },
        text: 'הדמות שלי',
      })
    );

    const portraitRow = createElement('div', { classes: 'my-world__portrait-row' });
    const avatarHalo = createElement('div', { classes: 'my-world__avatar-halo', attrs: { 'aria-hidden': 'true' } });
    const avatarWrap = createElement('div', { classes: 'avatar avatar--lg' });
    avatarWrapEl = avatarWrap;
    populateAvatarPortrait(profile);
    avatarHalo.append(avatarWrap);

    const portraitCol = createElement('div', { classes: 'my-world__portrait-col' });
    portraitCol.append(createElement('p', { classes: 'my-world__portrait-name', text: profile.name }));

    badgeRowEl = createElement('div', {
      classes: 'my-world__equipped-badges',
      attrs: { 'aria-label': 'פריטים שלובשים כרגע' },
    });
    populateEquippedBadges(profile);
    portraitCol.append(badgeRowEl);

    portraitRow.append(avatarHalo, portraitCol);
    section.append(portraitRow);

    section.append(createElement('h3', { classes: 'my-world__grid-title', text: 'בגדים' }));
    outfitGridEl = createElement('div', {
      classes: 'my-world__grid',
      attrs: { role: 'group', 'aria-label': 'בגדים' },
    });
    populateOutfitGrid(profile);
    section.append(outfitGridEl);

    return section;
  }

  /**
   * Rebuilds the portrait image + accessory overlays so equipping/
   * unequipping an outfit OR an accessory is reflected immediately.
   */
  function populateAvatarPortrait(profile) {
    if (!avatarWrapEl) return;
    clearElement(avatarWrapEl);
    avatarWrapEl.append(createImageWithFallback({ ...getAvatarImageSources(profile), alt: profile.name }));
  }

  function populateEquippedBadges(profile) {
    if (!badgeRowEl) return;
    clearElement(badgeRowEl);

    const equipped = [];
    if (profile.appearance.outfitId) {
      const outfit = OUTFIT_ITEMS.find((o) => o.id === profile.appearance.outfitId);
      if (outfit) equipped.push(outfit);
    }

    if (equipped.length === 0) {
      badgeRowEl.append(
        createElement('p', {
          classes: 'my-world__equipped-empty',
          text: 'עדיין לא לובשים כלום — המשיכו לשחק בתחנות כדי לגלות פריטים!',
        })
      );
      return;
    }

    for (const item of equipped) {
      badgeRowEl.append(
        createElement('span', {
          classes: 'my-world__equipped-badge',
          attrs: { role: 'img', 'aria-label': item.labelHe },
          text: item.fallbackEmoji,
        })
      );
    }
  }

  function populateOutfitGrid(profile) {
    if (!outfitGridEl) return;
    clearElement(outfitGridEl);
    const owned = profile.inventory.outfits;

    for (const item of OUTFIT_ITEMS) {
      const isOwned = owned.includes(item.id);
      const isActive = profile.appearance.outfitId === item.id;
      outfitGridEl.append(
        buildRewardCard(item, {
          owned: isOwned,
          active: isActive,
          kind: 'outfit',
          pop: item.id === lastToggledItemId,
          onTap: () => handleOutfitTap(item),
        })
      );
    }
  }

  async function handleOutfitTap(item) {
    soundManager.playEffect('click');
    await profileManager.setEquippedOutfit(item.id);
    lastToggledItemId = item.id;
    const profile = profileManager.getActiveProfile();
    populateOutfitGrid(profile);
    populateEquippedBadges(profile);
    populateAvatarPortrait(profile);
    lastToggledItemId = null;
  }

  // ---- Section 1.5: "המדליות שלי" ----
  // One medal per learning category (station), derived from the highest
  // adaptive level ever reached there (js/rewards/medals.js) — silver at
  // "medium" difficulty, upgrading permanently to gold at "hard". Purely
  // informational (not tappable/equippable like the outfit/furniture
  // grids above), so these render as plain divs, not buttons.

  function buildMedalsSection(profile) {
    const section = createElement('section', {
      classes: ['my-world__section', 'my-world__section--medals'],
      attrs: { 'aria-labelledby': 'my-world-medals-title' },
    });

    const titleRow = createElement('div', { classes: 'my-world__medals-title-row' });
    titleRow.append(
      createElement('h2', {
        classes: 'my-world__section-title',
        attrs: { id: 'my-world-medals-title' },
        text: 'המדליות שלי',
      })
    );

    const earnedCount = ALL_CATEGORY_KEYS.filter((key) => profile.medals[key]).length;
    titleRow.append(
      createElement('span', {
        classes: 'my-world__medals-progress',
        text: `${earnedCount} מתוך ${ALL_CATEGORY_KEYS.length} 🏆`,
      })
    );
    section.append(titleRow);

    // Earned medals first (gold, then silver) — a child sees their wins
    // right away, with "still to earn" goals trailing after, rather than
    // opening on a row of dimmed locks in category-list order.
    const tierRank = { gold: 2, silver: 1 };
    const sortedKeys = [...ALL_CATEGORY_KEYS].sort((a, b) => {
      const rankA = tierRank[profile.medals[a]] ?? 0;
      const rankB = tierRank[profile.medals[b]] ?? 0;
      return rankB - rankA;
    });

    const grid = createElement('div', {
      classes: 'my-world__grid my-world__grid--medals',
      attrs: { role: 'group', 'aria-label': 'המדליות שלי' },
    });
    for (const categoryKey of sortedKeys) {
      grid.append(buildMedalCard(categoryKey, profile.medals[categoryKey]));
    }
    section.append(grid);

    return section;
  }

  /** @param {string} categoryKey @param {'silver'|'gold'|undefined} tier */
  function buildMedalCard(categoryKey, tier) {
    const label = CategoryLabelsHe[categoryKey];
    const emoji = tier === 'gold' ? '🥇' : tier === 'silver' ? '🥈' : '🎯';
    const tierLabelHe = tier === 'gold' ? 'מדליית זהב!' : tier === 'silver' ? 'מדליית כסף!' : 'עוד לא הושגה';

    const classes = ['my-world__medal-card'];
    if (!tier) classes.push('my-world__medal-card--locked');
    if (tier) classes.push(`my-world__medal-card--${tier}`);

    const card = createElement('div', {
      classes,
      attrs: { role: 'img', 'aria-label': `${label}: ${tierLabelHe}` },
    });
    card.append(
      createElement('div', { classes: 'my-world__medal-badge', attrs: { 'aria-hidden': 'true' } }, [
        createElement('span', { text: emoji }),
      ]),
      createElement('span', { classes: 'my-world__medal-label', text: label }),
      createElement('span', { classes: 'my-world__medal-caption', text: tierLabelHe })
    );
    return card;
  }

  // ---- Section 2: "העולם שלי" ----

  function buildWorldSection(profile) {
    const section = createElement('section', {
      classes: ['my-world__section', 'my-world__section--world'],
      attrs: { 'aria-labelledby': 'my-world-world-title' },
    });
    section.append(
      createElement('h2', {
        classes: 'my-world__section-title',
        attrs: { id: 'my-world-world-title' },
        text: 'העולם שלי',
      })
    );

    section.append(createElement('h3', { classes: 'my-world__grid-title', text: 'רהיטים' }));
    furnitureGridEl = createElement('div', {
      classes: 'my-world__grid',
      attrs: { role: 'group', 'aria-label': 'רהיטים' },
    });
    populateFurnitureGrid(profile);
    section.append(furnitureGridEl);

    section.append(createElement('h3', { classes: 'my-world__grid-title', text: 'רקעי מפה' }));
    mapThemeGridEl = createElement('div', {
      classes: 'my-world__grid',
      attrs: { role: 'group', 'aria-label': 'רקעי מפה' },
    });
    populateMapThemeGrid(profile);
    section.append(mapThemeGridEl);

    section.append(createElement('h3', { classes: 'my-world__grid-title', text: 'החדר שלי' }));
    roomPreviewEl = createElement('div', {
      classes: 'my-world__room-preview',
      attrs: { 'aria-label': 'תצוגת החדר שלי' },
    });
    // Graceful background-image fallback — same Image()-probe pattern used
    // for the world map's background (WorldMapScreen.js's bgProbe): if the
    // room scene art is ever missing, fall back to a plain warm gradient
    // rather than a broken-image look.
    const roomBgProbe = new Image();
    roomBgProbe.onerror = () => roomPreviewEl.classList.add('my-world__room-preview--fallback-bg');
    roomBgProbe.src = 'assets/images/my-world/room-scene.png';
    populateRoomPreview(profile);
    section.append(roomPreviewEl);

    return section;
  }

  function populateFurnitureGrid(profile) {
    if (!furnitureGridEl) return;
    clearElement(furnitureGridEl);
    const owned = profile.inventory.furniture;
    const placed = profile.world.placedFurniture;

    for (const item of FURNITURE_ITEMS) {
      const isOwned = owned.includes(item.id);
      const isPlaced = placed.includes(item.id);
      furnitureGridEl.append(
        buildRewardCard(item, {
          owned: isOwned,
          active: isPlaced,
          kind: 'furniture',
          pop: item.id === lastToggledItemId,
          onTap: () => handleFurnitureTap(item),
        })
      );
    }
  }

  function populateMapThemeGrid(profile) {
    if (!mapThemeGridEl) return;
    clearElement(mapThemeGridEl);
    const owned = profile.inventory.mapThemes;

    for (const item of MAP_THEME_ITEMS) {
      const isOwned = owned.includes(item.id);
      const isActive = profile.world.mapThemeId === item.id;
      mapThemeGridEl.append(
        buildRewardCard(item, {
          owned: isOwned,
          active: isActive,
          kind: 'mapTheme',
          pop: item.id === lastToggledItemId,
          onTap: () => handleMapThemeTap(item),
        })
      );
    }
  }

  async function handleMapThemeTap(item) {
    soundManager.playEffect('click');
    await profileManager.setEquippedMapTheme(item.id);
    lastToggledItemId = item.id;
    const profile = profileManager.getActiveProfile();
    populateMapThemeGrid(profile);
    lastToggledItemId = null;
  }

  function populateRoomPreview(profile) {
    if (!roomPreviewEl) return;
    clearElement(roomPreviewEl);
    const placedIds = profile.world.placedFurniture;

    if (placedIds.length === 0) {
      roomPreviewEl.append(
        createElement('p', {
          classes: 'my-world__room-empty',
          text: 'החדר עדיין ריק — הניחו רהיטים כדי לקשט אותו!',
        })
      );
      return;
    }

    for (const id of placedIds) {
      const item = FURNITURE_ITEMS.find((f) => f.id === id);
      if (!item) continue;
      const el = createImageWithFallback({
        src: `assets/images/my-world/furniture/${item.id}.png`,
        alt: item.labelHe,
        emoji: item.fallbackEmoji,
        wrapperClass: 'my-world__room-item',
      });
      el.dataset.item = item.id;

      // A remembered custom drop spot overrides the stylesheet's default
      // position (inline style always wins). Left untouched — no inline
      // style at all — until the child drags this item for the first time,
      // so it keeps its hand-picked default spot until then.
      const savedPos = profile.world.furniturePositions?.[item.id];
      if (savedPos) {
        el.style.insetInlineStart = `${savedPos.x}%`;
        el.style.insetInlineEnd = 'auto';
        el.style.insetBlockStart = `${savedPos.y}%`;
        el.style.insetBlockEnd = 'auto';
      }

      makeRoomItemDraggable(el, item);
      roomPreviewEl.append(el);
    }
  }

  /**
   * Lets a child drag a placed furniture piece anywhere within the room
   * preview with mouse or touch (Pointer Events cover both uniformly).
   * Position is tracked as `inset-inline-start`/`inset-block-start`
   * percentages of the room container — logical, not physical, so it stays
   * correct in this RTL-only app (inline-start = physical right here).
   * `setPointerCapture` keeps move/up events targeting this element even
   * once the pointer leaves its bounds, so no window-level listeners are
   * needed.
   */
  function makeRoomItemDraggable(el, item) {
    el.addEventListener('pointerdown', (downEvent) => {
      const containerRect = roomPreviewEl.getBoundingClientRect();
      const itemRect = el.getBoundingClientRect();

      const widthPct = (itemRect.width / containerRect.width) * 100;
      const heightPct = (itemRect.height / containerRect.height) * 100;
      // Read the item's CURRENT rendered position (whether that came from
      // the stylesheet default or an already-saved custom spot) as a
      // starting point, so the first drag never causes a visual jump.
      const startInlineStartPct = ((containerRect.right - itemRect.right) / containerRect.width) * 100;
      const startBlockStartPct = ((itemRect.top - containerRect.top) / containerRect.height) * 100;

      const startClientX = downEvent.clientX;
      const startClientY = downEvent.clientY;
      let latestX = startInlineStartPct;
      let latestY = startBlockStartPct;

      el.setPointerCapture(downEvent.pointerId);
      el.classList.add('my-world__room-item--dragging');

      function onMove(moveEvent) {
        const deltaXPhysical = moveEvent.clientX - startClientX;
        const deltaYPhysical = moveEvent.clientY - startClientY;
        // inset-inline-start measures distance from the container's RIGHT
        // edge here (RTL), so dragging physically rightward must DECREASE
        // it — the delta sign is flipped relative to physical clientX.
        const deltaInlineStartPct = (-deltaXPhysical / containerRect.width) * 100;
        const deltaBlockStartPct = (deltaYPhysical / containerRect.height) * 100;

        latestX = clampPercent(startInlineStartPct + deltaInlineStartPct, widthPct);
        latestY = clampPercent(startBlockStartPct + deltaBlockStartPct, heightPct);

        el.style.insetInlineStart = `${latestX}%`;
        el.style.insetInlineEnd = 'auto';
        el.style.insetBlockStart = `${latestY}%`;
        el.style.insetBlockEnd = 'auto';
      }

      function onUp(upEvent) {
        el.releasePointerCapture(upEvent.pointerId);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.classList.remove('my-world__room-item--dragging');
        profileManager.setFurniturePosition(item.id, latestX, latestY);
      }

      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    });
  }

  /** Keeps a dragged item's top-left corner fully inside the room preview. */
  function clampPercent(value, sizePct) {
    return Math.min(Math.max(value, 0), Math.max(100 - sizePct, 0));
  }

  async function handleFurnitureTap(item) {
    soundManager.playEffect('click');
    await profileManager.toggleFurniturePlacement(item.id);
    lastToggledItemId = item.id;
    const profile = profileManager.getActiveProfile();
    populateFurnitureGrid(profile);
    populateRoomPreview(profile);
    lastToggledItemId = null;
  }

  // ---- Shared card builder ----

  /**
   * @param {{id: string, labelHe: string, fallbackEmoji: string}} item
   * @param {{owned: boolean, active: boolean, kind: 'outfit'|'accessory'|'furniture', pop: boolean, onTap: Function}} opts
   * @returns {HTMLButtonElement}
   */
  function buildRewardCard(item, opts) {
    const { owned, active, kind, pop, onTap } = opts;

    const classes = ['my-world__card', `my-world__card--${kind}`];
    if (!owned) classes.push('my-world__card--locked');
    if (owned && active) classes.push('my-world__card--active');
    if (pop) classes.push('my-world__card--pop');

    const btn = createElement('button', {
      classes,
      attrs: {
        type: 'button',
        'aria-pressed': owned ? String(Boolean(active)) : 'false',
        'aria-label': owned ? item.labelHe : `${item.labelHe} — עוד לא נמצא`,
      },
    });

    btn.append(
      createElement('div', { classes: 'my-world__card-emoji', attrs: { 'aria-hidden': 'true' } }, [
        createElement('span', { text: owned ? item.fallbackEmoji : '🔒' }),
      ]),
      createElement('span', { classes: 'my-world__card-label', text: item.labelHe })
    );

    if (!owned) {
      btn.append(createElement('span', { classes: 'my-world__card-caption', text: 'עוד לא נמצא' }));
    } else if (kind === 'furniture') {
      // Furniture has no single "equipped" slot — several pieces can be
      // placed at once — so it always shows a checkmark for owned items,
      // filled when placed and outline when not, rather than the
      // outfit/accessory pattern of only showing a badge when active.
      btn.append(
        createElement('span', {
          classes: ['my-world__card-check', active ? 'my-world__card-check--filled' : ''].filter(Boolean),
          attrs: { 'aria-hidden': 'true' },
          text: '✓',
        })
      );
    }

    btn.addEventListener('click', () => {
      if (!owned) {
        showToast('עוד לא מצאת את זה — המשיכו לשחק בתחנות!');
        return;
      }
      onTap();
    });

    if (pop) {
      btn.addEventListener('animationend', () => btn.classList.remove('my-world__card--pop'), { once: true });
    }

    return btn;
  }

  return { mount, unmount };
}
