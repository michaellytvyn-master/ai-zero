CREATE TABLE "request_window" (
	"user_id" text NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "request_window" ADD CONSTRAINT "request_window_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "request_window_user_minute" ON "request_window" USING btree ("user_id","minute");