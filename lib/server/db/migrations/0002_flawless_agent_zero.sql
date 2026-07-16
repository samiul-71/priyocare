ALTER TABLE "bookings" ADD COLUMN "idempotency_key" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bookings_idempotency_key" ON "bookings" USING btree ("idempotency_key");