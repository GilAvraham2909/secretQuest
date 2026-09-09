import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

/**
 * The schema — architecture §6.0 (tenancy) and §6.6 seams S2 and S3.
 *
 * THE SHAPE IS THE SECURITY MODEL
 * ===============================
 * Every table that holds anything about a child carries `child_id`, and every
 * child carries `parent_id`. There is no table you can read usefully without
 * passing through that chain, which is what lets one guard (repo/guard.ts)
 * cover the whole surface instead of every handler remembering.
 *
 * `child_id` is NOT NULL everywhere it appears, on purpose. A nullable tenant
 * key is an invitation to write a row nobody owns, and a row nobody owns is a
 * row no ownership check can exclude.
 */

// ── Tenancy ───────────────────────────────────────────────────────────────

export const parents = pgTable(
  'parents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * The auth provider's subject claim. Server-generated identity, never
     * client-supplied — this is the only column that decides who anyone is.
     */
    authUserId: text('auth_user_id').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('parents_auth_user_id_key').on(t.authUserId),
    uniqueIndex('parents_stripe_customer_key').on(t.stripeCustomerId),
  ],
);

export const children = pgTable(
  'children',
  {
    /**
     * Client-generated (architecture §6.3 rule 3) so the very first session can
     * run before the network ever succeeds. That makes the id a value an
     * attacker chooses, which is why creation is idempotent WITHIN a parent and
     * a hard conflict across parents — never a blind upsert. See §6.0.
     */
    id: uuid('id').primaryKey(),
    parentId: uuid('parent_id')
      .notNull()
      .references(() => parents.id, { onDelete: 'cascade' }),
    /**
     * A first name or a nickname, and nothing else. The end users are 5-7:
     * there is deliberately no email, no date of birth and no free-text field
     * a parent could type an address into. Contact details live on the parent,
     * which is the only row a person has consented on.
     */
    displayName: text('display_name'),
    avatarId: text('avatar_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('children_parent_idx').on(t.parentId)],
);

// ── Sessions and the raw log ──────────────────────────────────────────────

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    /**
     * Nullable and not load-bearing. `session.ended` is best-effort — spec 16.4
     * forbids penalising a child for quitting, and every task event was already
     * durable when it happened, so a missing end costs nothing. A sweep closes
     * stale sessions.
     */
    endedAt: timestamp('ended_at', { withTimezone: true }),
    clientAppVersion: text('client_app_version').notNull(),
    contentPackVersion: text('content_pack_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_child_idx').on(t.childId, t.startedAt)],
);

export const events = pgTable(
  'events',
  {
    /**
     * SEAM S2. The client's uuid is the primary key, which makes the whole
     * offline story work: re-POSTing a batch is an upsert that conflicts and
     * does nothing, so the flusher can retry forever without ever needing to
     * know what the server already has.
     */
    eventId: uuid('event_id').primaryKey(),
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull(),
    clientSeq: integer('client_seq').notNull(),
    type: text('type').notNull(),
    /** Client clock. Advisory — see clientSeq. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    /** The only clock that can order events ACROSS children. */
    serverReceivedAt: timestamp('server_received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    schemaVersion: integer('schema_version').notNull(),
    payload: jsonb('payload').notNull(),
  },
  (t) => [
    // Replay for one session, in the order the client produced it — spec 1.4's
    // "ניתן לשחזר את רצף הפעולות".
    index('events_session_seq_idx').on(t.sessionId, t.clientSeq),
    index('events_child_seq_idx').on(t.childId, t.clientSeq),
  ],
);

// ── Projections ───────────────────────────────────────────────────────────
/**
 * Derived from the event log, never written directly by a client.
 *
 * SEAM S3: the columns criterion 3.11 groups by — skill_id, mechanic_id,
 * target_content_id — are real indexed columns, not JSON paths. "Which skills
 * are hard on which mechanic" must be an index scan; as a JSONB scan it would
 * be the parent dashboard's slowest query and would get worse every session.
 */

export const taskInstances = pgTable(
  'task_instances',
  {
    id: uuid('id').primaryKey(),
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull(),
    taskId: text('task_id').notNull(),
    skillId: text('skill_id').notNull(),
    mechanicId: text('mechanic_id').notNull(),
    targetContentId: text('target_content_id').notNull(),
    optionCount: integer('option_count').notNull(),
    optionsPresented: jsonb('options_presented').notNull(),
    /**
     * Scaffolded instances count as exposure but never as mastery or as
     * difficulty evidence — otherwise the system punishes its own help.
     */
    isScaffolded: boolean('is_scaffolded').notNull().default(false),
    derivedFromTaskInstanceId: uuid('derived_from_task_instance_id'),
    adventureRunId: uuid('adventure_run_id'),
    presentedAt: timestamp('presented_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    outcome: text('outcome'),
  },
  (t) => [
    index('ti_child_skill_mechanic_idx').on(t.childId, t.skillId, t.mechanicId),
    index('ti_child_target_idx').on(t.childId, t.targetContentId),
    index('ti_session_idx').on(t.sessionId),
  ],
);

export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').primaryKey(),
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    taskInstanceId: uuid('task_instance_id').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    selectedOptionId: text('selected_option_id').notNull(),
    selectedContentId: text('selected_content_id').notNull(),
    /**
     * The SERVER's determination, re-derived from selectedContentId against the
     * task instance's target — architecture §6.2. The client's opinion arrives
     * in the event payload and is deliberately not what lands here.
     */
    isCorrect: boolean('is_correct').notNull(),
    responseTimeMs: integer('response_time_ms').notNull(),
    ladderStepAtAttempt: integer('ladder_step_at_attempt').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('attempts_task_instance_idx').on(t.taskInstanceId)],
);

export const hintEvents = pgTable(
  'hint_events',
  {
    id: uuid('id').primaryKey(),
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    taskInstanceId: uuid('task_instance_id').notNull(),
    ladderStep: integer('ladder_step').notNull(),
    hintType: text('hint_type').notNull(),
    trigger: text('trigger').notNull(),
    acceptedByChild: boolean('accepted_by_child'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('hints_task_instance_idx').on(t.taskInstanceId)],
);

export const skillStates = pgTable(
  'skill_states',
  {
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    skillId: text('skill_id').notNull(),
    /**
     * Empty string, not NULL, for the skill-level rollup. A NULL here would be
     * part of the primary key, and NULLs in keys behave differently across
     * engines in exactly the way that produces duplicate rows nobody notices
     * until the parent screen shows a skill twice.
     */
    contentScopeId: text('content_scope_id').notNull().default(''),
    status: text('status').notNull(),
    exposures: integer('exposures').notNull().default(0),
    firstTryCorrect: integer('first_try_correct').notNull().default(0),
    hintAssisted: integer('hint_assisted').notNull().default(0),
    distinctMechanics: jsonb('distinct_mechanics').notNull(),
    needsReinforcement: boolean('needs_reinforcement').notNull().default(false),
    reinforcedAtSessionId: uuid('reinforced_at_session_id'),
    /** Which policy produced this row, so a status can be explained later. */
    policyVersion: text('policy_version').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.childId, t.skillId, t.contentScopeId] })],
);

export const worldStates = pgTable('world_states', {
  childId: uuid('child_id')
    .primaryKey()
    .references(() => children.id, { onDelete: 'cascade' }),
  coins: integer('coins').notNull().default(0),
  unlockedItems: jsonb('unlocked_items').notNull(),
  placedItems: jsonb('placed_items').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Billing ───────────────────────────────────────────────────────────────

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: text('id').primaryKey(), // Stripe subscription id
    parentId: uuid('parent_id')
      .notNull()
      .references(() => parents.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    tier: text('tier').notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('subscriptions_parent_idx').on(t.parentId)],
);

/**
 * Stripe webhook idempotency. Stripe retries, and a replayed
 * `checkout.session.completed` must not extend a period or re-grant anything.
 * The id is inserted BEFORE the event is acted on; a conflict means it is
 * already handled and the delivery is acknowledged without doing the work
 * twice.
 */
export const processedWebhookEvents = pgTable('processed_webhook_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * What each tier includes. A TABLE, not a constant, because nobody has decided
 * what is free and what is paid yet (architecture §6.0) — the enforcement point
 * is built, the policy arrives later without a rebuild.
 */
export const entitlementRules = pgTable('entitlement_rules', {
  tier: text('tier').primaryKey(),
  includedPackIds: jsonb('included_pack_ids').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
