import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { kbId, message } = await req.json();

    if (!kbId || !message) {
      return NextResponse.json({ error: "kbId and message required" }, { status: 400 });
    }

    // Yahan tumhari actual chat/RAG logic call karo
    // Abhi simple MuAPI / Gemini fallback — baad mein apni service se replace kar lena
    const response = await fetch("https://api.muapi.ai/api/v1/gpt-4o-mini", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.MU_API_KEY,
      },
      body: JSON.stringify({
        prompt: `You are a helpful assistant for the knowledge base. Answer this user question: ${message}`,
      }),
    });

    const data = await response.json();

    // MuAPI async pattern — adjust according to your actual response shape
    const reply =
      data?.outputs?.[0] ||
      data?.output ||
      data?.text ||
      data?.choices?.[0]?.message?.content ||
      "Sorry, I could not generate a reply right now.";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}