CREATE TABLE "login_attempt" (
	"key" text NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "login_attempt_key_minute" ON "login_attempt" USING btree ("key","minute");