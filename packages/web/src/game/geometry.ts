/**
 * Measuring a line between two elements on screen.
 *
 * WHY THIS IS MEASURED AND NOT WRITTEN IN CSS
 * ===========================================
 * Two mechanics draw a line from a fixed point to whichever option the child
 * chose — the fishing line to the caught stone, the sound-link to the matched
 * card. Where that option is depends on the viewport: options sit in a wrapping
 * flex row, so their positions are not knowable at authoring time. CSS can
 * animate the line but it cannot aim it.
 *
 * Living in packages/web, not packages/shared: this is presentation, and the
 * shared domain layer must stay free of the DOM so it can run on the server.
 *
 * THE ROTATION MATH, ONCE
 * =======================
 * A line element is drawn hanging straight DOWN from its anchor, with
 * `transform-origin: top center`. CSS `rotate(θ)` in screen coordinates (x
 * right, y down) maps a point (x,y) to (x·cosθ − y·sinθ, x·sinθ + y·cosθ), so
 * the downward vector (0,L) lands at (−L·sinθ, L·cosθ).
 *
 * To reach an offset (dx,dy) we therefore need
 *     −L·sinθ = dx  and  L·cosθ = dy   →   θ = atan2(−dx, dy)
 * with L the plain distance. The negated dx is the part that is easy to get
 * wrong and impossible to spot in review, which is most of why this is one
 * function with one test rather than two lookalike blocks in two components.
 */

export interface Link {
  /** Distance from anchor to target, in px. */
  readonly len: number;
  /** Rotation for a top-anchored vertical line, in degrees. */
  readonly angleDeg: number;
  /** Physical viewport offset, anchor → target. */
  readonly dx: number;
  readonly dy: number;
}

export function linkBetween(dx: number, dy: number): Link {
  return {
    len: Math.hypot(dx, dy),
    angleDeg: (Math.atan2(-dx, dy) * 180) / Math.PI,
    dx,
    dy,
  };
}

/**
 * Measures from a zero-size anchor element to a point inside a target element.
 *
 * `aimY` is a fraction of the target's height rather than its centre because
 * the sign-stone sprite is drawn in perspective — its visual middle, where the
 * glyph sits, is above its box middle.
 *
 * Measure the ANCHOR, never the line: the line is mid-animation and rotating,
 * so its bounding box is not where it is attached.
 */
export function measureLink(
  anchor: Element,
  target: Element,
  aimY = 0.5,
): Link {
  const a = anchor.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  return linkBetween(
    t.left + t.width / 2 - (a.left + a.width / 2),
    t.top + t.height * aimY - (a.top + a.height / 2),
  );
}

/**
 * Writes a measured link onto the elements that animate it.
 *
 * The line gets a length and an angle; the option gets the same vector back,
 * scaled by `travel`, so it rides that exact ray. Line length and option travel
 * must stay the same fraction of the same vector or the two come apart halfway
 * through — which is precisely the bug the client reported on the fishing rod.
 */
export function applyLink(
  link: Link,
  lineHost: HTMLElement,
  option: HTMLElement,
  travel: number,
): void {
  lineHost.style.setProperty('--catch-len', `${link.len}px`);
  lineHost.style.setProperty('--catch-angle', `${link.angleDeg}deg`);
  option.style.setProperty('--reel-x', `${-link.dx * travel}px`);
  option.style.setProperty('--reel-y', `${-link.dy * travel}px`);
}
