/**
 * Who is making this request.
 *
 * There is exactly one kind of principal in this system: a parent. A child
 * never has credentials, never holds a token and never authenticates
 * (architecture §6.0) — which also means there is no child login screen to
 * design, the right answer for a five-year-old.
 *
 * The JWT verification itself belongs to the auth provider's SDK and to the
 * edge, not here. What this module owns is the *shape*: everything downstream
 * takes a Principal, so no handler is ever in a position to read an id out of a
 * request body and treat it as an identity.
 */

export interface Principal {
  readonly parentId: string;
  /** The auth provider's subject claim. Kept for audit lines, never for lookup. */
  readonly authUserId: string;
}

/**
 * Thrown when a request carries no usable session.
 *
 * Distinct from NotFound below, and the distinction matters: this one is
 * honest, because "you are not signed in" tells an attacker nothing they did
 * not already know.
 */
export class Unauthenticated extends Error {
  readonly status = 401;
  constructor() {
    super('authentication required');
    this.name = 'Unauthenticated';
  }
}

/**
 * Thrown when a resource does not exist OR is not yours. Deliberately one
 * error for both.
 *
 * A 403 on someone else's child confirms that child exists, which turns the
 * endpoint into a membership oracle over other families' children: guess ids,
 * read the status codes, learn who is a customer. 404 leaks nothing, and it
 * costs nothing to be right about this from the first endpoint rather than
 * after a review.
 */
export class NotFound extends Error {
  readonly status = 404;
  constructor(what = 'not found') {
    super(what);
    this.name = 'NotFound';
  }
}

/** A request that is well-formed but conflicts with existing state. */
export class Conflict extends Error {
  readonly status = 409;
  constructor(what = 'conflict') {
    super(what);
    this.name = 'Conflict';
  }
}

/** A request whose body or parameters failed validation. */
export class BadRequest extends Error {
  readonly status = 400;
  constructor(
    what = 'bad request',
    readonly detail?: unknown,
  ) {
    super(what);
    this.name = 'BadRequest';
  }
}
