import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db, metaDb, outboxDB } from "@video-transcoding/db";
import videoQueue from "@video-transcoding/queue";
import { eq, sql } from "drizzle-orm";

const BATCH_SIZE = 10;
const POLL_INTERVAL = 2000; // 2 seconds

interface OutboxRow {
  id: number;
  upload_id: string;
  filename: string;
  s3_key: string;
  s3_bucket: string;
  status: string | null;
  error: string | null;
  job_id: string | null;
  retry_count: number;
  next_retry_at: Date;
  uploaded_at: Date;
  updated_at: Date | null;
}

async function fetchPendingRowsWithLock(limit: number): Promise<OutboxRow[]> {
  const result = await db.execute(
    sql.raw(`
    SELECT *
    FROM outbox
    WHERE (
        status = 'pending'
        OR (
            status = 'failed'
            AND next_retry_at <= NOW()
        )
    )
    ORDER BY id
    FOR UPDATE SKIP LOCKED
    LIMIT ${limit}
  `),
  );
  // @ts-ignore
  return result.rows as OutboxRow[];
}

async function processOutbox() {
  const rows = await fetchPendingRowsWithLock(BATCH_SIZE);
  if (rows.length === 0) return;
  for (const row of rows) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(outboxDB)
          .set({
            status: "processing",
            updatedAt: new Date(),
          })
          .where(eq(outboxDB.id, row.id));

        await tx
          .update(metaDb)
          .set({ status: "queued" })
          .where(eq(metaDb.uploadId, row.upload_id));

        const job = await videoQueue.add("transcode", {
          uploadId: row.upload_id,
          filename: row.filename,
          s3Key: row.s3_key,
          bucket: row.s3_bucket,
        });

        if (job?.id) {
          await tx
            .update(outboxDB)
            .set({ jobId: job.id.toString() })
            .where(eq(outboxDB.id, row.id));

          await tx
            .update(metaDb)
            .set({ jobId: job.id.toString() })
            .where(eq(metaDb.uploadId, row.upload_id));
        }

        await tx
          .update(outboxDB)
          .set({
            status: "sent",
            retryCount: 0,
            error: null,
            updatedAt: new Date(),
          })
          .where(eq(outboxDB.id, row.id));

        console.log(`Processed ${rows.length} outbox entries`);
      });
    } catch (err) {
      console.error("Sweeper service error:", err);
      const message = err instanceof Error ? err.message : String(err);

      const retries = row.retry_count + 1;

      if (retries >= 5) {
        await db
          .update(outboxDB)
          .set({
            status: "dead",
            retryCount: retries,
            error: message,
            updatedAt: new Date(),
          })
          .where(eq(outboxDB.id, row.id));
      } else {
        const backoffMs = Math.min(
          1000 * Math.pow(2, retries),
          30 * 60 * 1000, // max 30 minutes
        );

        await db
          .update(outboxDB)
          .set({
            status: "failed",
            retryCount: retries,
            nextRetryAt: new Date(Date.now() + backoffMs),
            error: message,
            updatedAt: new Date(),
          })
          .where(eq(outboxDB.id, row.id));
      }
    }
  }
}

let isShuttingDown = false;
const intervalId = setInterval(async () => {
  if (!isShuttingDown) {
    await processOutbox();
  }
}, POLL_INTERVAL);

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down sweeper service...");
  isShuttingDown = true;
  clearInterval(intervalId);
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down sweeper service...");
  isShuttingDown = true;
  clearInterval(intervalId);
  process.exit(0);
});

console.log("Sweeper Service Started...");
console.log(
  `Polling every ${POLL_INTERVAL}ms for ${BATCH_SIZE} rows at a time`,
);
