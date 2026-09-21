CREATE TABLE "client_identity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_identity_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "todo" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"text" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_owner_id_client_identity_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."client_identity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "todo_owner_id_id_idx" ON "todo" USING btree ("owner_id","id" DESC NULLS LAST);