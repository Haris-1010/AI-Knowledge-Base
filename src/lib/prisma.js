import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis;

function createPrismaClient() {
  const url = new URL(process.env.DATABASE_URL);
  const pool = new Pool({
    host: url.hostname,
    port: parseInt(url.port || "5432"),
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.replace("/", ""),
    ssl: {
      rejectUnauthorized: false,
    },
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
