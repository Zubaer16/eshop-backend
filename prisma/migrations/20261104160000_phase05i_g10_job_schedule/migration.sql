-- G10 additive only. Owner must take/check backups before applying.
CREATE TABLE "job_schedules" (
  "lane" VARCHAR(48) NOT NULL PRIMARY KEY,
  "lease_token" UUID,
  "lease_expires_at" TIMESTAMP(3),
  "next_run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_started_at" TIMESTAMP(3),
  "last_finished_at" TIMESTAMP(3),
  "last_outcome" VARCHAR(16),
  "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "job_schedules_next_run_at_idx" ON "job_schedules" ("next_run_at");
CREATE TABLE "job_runs" (
  "id" UUID NOT NULL PRIMARY KEY,
  "lane" VARCHAR(48) NOT NULL,
  "lease_token" UUID NOT NULL,
  "trigger" VARCHAR(16) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "processed" INTEGER NOT NULL DEFAULT 0,
  "error_code" VARCHAR(48),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3)
);
CREATE INDEX "job_runs_lane_started_at_id_idx" ON "job_runs" ("lane", "started_at", "id");
CREATE INDEX "job_runs_status_started_at_idx" ON "job_runs" ("status", "started_at");
