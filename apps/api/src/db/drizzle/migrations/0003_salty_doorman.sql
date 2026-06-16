ALTER TABLE "outbox" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "next_retry_at" timestamp with time zone DEFAULT now() NOT NULL;