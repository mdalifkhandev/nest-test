-- Rename typoed task description column while preserving existing data
ALTER TABLE "Task" RENAME COLUMN "discription" TO "description";
