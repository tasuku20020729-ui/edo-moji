import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const apiUrl = process.env.GENERATE_API_URL;
  const token = process.env.GENERATE_API_TOKEN;
  if (!apiUrl) return NextResponse.json({ error: "GENERATE_API_URL is not configured" }, { status: 500 });
  const body = await req.json();
  const r = await fetch(`${apiUrl.replace(/\/$/, "")}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
