import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

dotenv.config();

const runMigrations = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  console.log("Running migrations...");

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  await migrate(db, {
    migrationsFolder: "src/db/drizzle/migrations",
  });

  console.log("Migrations completed successfully");
  process.exit(0);
};

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
