CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"child_id" uuid NOT NULL,
	"task_instance_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"selected_option_id" text NOT NULL,
	"selected_content_id" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"response_time_ms" integer NOT NULL,
	"ladder_step_at_attempt" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid NOT NULL,
	"display_name" text,
	"avatar_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlement_rules" (
	"tier" text PRIMARY KEY NOT NULL,
	"included_pack_ids" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"child_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"client_seq" integer NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"server_received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"schema_version" integer NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hint_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"child_id" uuid NOT NULL,
	"task_instance_id" uuid NOT NULL,
	"ladder_step" integer NOT NULL,
	"hint_type" text NOT NULL,
	"trigger" text NOT NULL,
	"accepted_by_child" boolean,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text NOT NULL,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"child_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"client_app_version" text NOT NULL,
	"content_pack_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_states" (
	"child_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"content_scope_id" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"exposures" integer DEFAULT 0 NOT NULL,
	"first_try_correct" integer DEFAULT 0 NOT NULL,
	"hint_assisted" integer DEFAULT 0 NOT NULL,
	"distinct_mechanics" jsonb NOT NULL,
	"needs_reinforcement" boolean DEFAULT false NOT NULL,
	"reinforced_at_session_id" uuid,
	"policy_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_states_child_id_skill_id_content_scope_id_pk" PRIMARY KEY("child_id","skill_id","content_scope_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" uuid NOT NULL,
	"status" text NOT NULL,
	"tier" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_instances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"child_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"mechanic_id" text NOT NULL,
	"target_content_id" text NOT NULL,
	"option_count" integer NOT NULL,
	"options_presented" jsonb NOT NULL,
	"is_scaffolded" boolean DEFAULT false NOT NULL,
	"derived_from_task_instance_id" uuid,
	"adventure_run_id" uuid,
	"presented_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE "world_states" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"unlocked_items" jsonb NOT NULL,
	"placed_items" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hint_events" ADD CONSTRAINT "hint_events_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_states" ADD CONSTRAINT "skill_states_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_states" ADD CONSTRAINT "world_states_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_task_instance_idx" ON "attempts" USING btree ("task_instance_id");--> statement-breakpoint
CREATE INDEX "children_parent_idx" ON "children" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "events_session_seq_idx" ON "events" USING btree ("session_id","client_seq");--> statement-breakpoint
CREATE INDEX "events_child_seq_idx" ON "events" USING btree ("child_id","client_seq");--> statement-breakpoint
CREATE INDEX "hints_task_instance_idx" ON "hint_events" USING btree ("task_instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parents_auth_user_id_key" ON "parents" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parents_stripe_customer_key" ON "parents" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "sessions_child_idx" ON "sessions" USING btree ("child_id","started_at");--> statement-breakpoint
CREATE INDEX "subscriptions_parent_idx" ON "subscriptions" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "ti_child_skill_mechanic_idx" ON "task_instances" USING btree ("child_id","skill_id","mechanic_id");--> statement-breakpoint
CREATE INDEX "ti_child_target_idx" ON "task_instances" USING btree ("child_id","target_content_id");--> statement-breakpoint
CREATE INDEX "ti_session_idx" ON "task_instances" USING btree ("session_id");