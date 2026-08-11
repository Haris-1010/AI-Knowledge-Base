import { NextResponse } from "next/server";
import { Pool } from "pg";

export async function GET() {
  try {
    const url = new URL(process.env.DATABASE_URL);
    const pool = new Pool({
      host: url.hostname,
      port: parseInt(url.port || "5432"),
      user: url.username,
      password: decodeURIComponent(url.password),
      database: url.pathname.replace("/", ""),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    const result = await pool.query("SELECT NOW() as time, current_database() as db");
    await pool.end();

    return NextResponse.json({
      status: "ok",
      time: result.rows[0].time,
      database: result.rows[0].db,
      host: url.hostname,
      port: url.port,
    });
  } catch (e) {
    return NextResponse.json({
      status: "error",
      message: e.message,
      code: e.code,
    }, { status: 500 });
  }
}
