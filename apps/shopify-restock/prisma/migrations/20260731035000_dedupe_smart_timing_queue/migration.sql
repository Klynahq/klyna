ALTER TABLE "QueuedNotification"
  ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);
