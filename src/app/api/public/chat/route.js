import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function POST(req) {
  try {
    const { kbId, message } = await req.json();

    if (!kbId || !message || !message.trim()) {
      return NextResponse.json(
        { error: "kbId and message required" },
        { status: 400 }
      );
    }

    // 1. Knowledge Base check
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      select: { id: true, name: true },
    });

    if (!kb) {
      return NextResponse.json(
        { error: "Knowledge base not found" },
        { status: 404 }
      );
    }

    // 2. Sources nikaalo (Q&A, files, URLs)
    const sources = await prisma.source.findMany({
      where: { knowledgeBaseId: kbId },
    });

    // 3. Simple keyword matching (playground jaisa)
    let contextBlock = "";
    let matchedSources = [];

    if (sources.length > 0) {
      const stopWords = new Set([
        "the","is","are","was","were","a","an","and","or","but","if","to","from",
        "in","on","at","for","with","about","this","that","what","which","who",
        "how","all","some","any","not","only","just","also","it","its","my","your",
      ]);

      const keywords = message
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !stopWords.has(w));

      const scored = sources
        .map((s) => {
          let score = 0;
          const body = (s.content || "").toLowerCase();
          const title = (s.name || "").toLowerCase();

          keywords.forEach((kw) => {
            if (body.includes(kw)) score += 2;
            if (title.includes(kw)) score += 5;
          });

          return { source: s, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      if (scored.length > 0) {
        matchedSources = scored.map((item) => ({
          name: item.source.name,
          type: item.source.type,
        }));

        contextBlock = scored
          .map(
            (item, idx) =>
              `[SOURCE ${idx + 1}: ${item.source.name} (${item.source.type})]\n${item.source.content}\n`
          )
          .join("\n---\n");
      } else {
        // koi keyword match na ho toh top sources de do
        contextBlock = sources
          .slice(0, 5)
          .map(
            (s, idx) =>
              `[SOURCE ${idx + 1}: ${s.name} (${s.type})]\n${s.content}\n`
          )
          .join("\n---\n");
      }
    }

    if (!contextBlock.trim()) {
      return NextResponse.json({
        reply:
          "This knowledge base has no trained content yet. Please add Q&A, files, or URLs first.",
      });
    }

    // 4. Gemini se answer
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const systemPrompt = `You are a helpful AI assistant for the "${kb.name}" knowledge base.

RULES:
- Answer ONLY using the knowledge base documents below.
- Be clear, concise, and direct.
- Use short bullet points when listing things.
- If the documents don't have the answer, say you don't have that information.
- Do not invent facts outside the documents.

KNOWLEDGE BASE DOCUMENTS:
${contextBlock}

User Question: "${message}"`;

    const geminiRes = await fetch(
`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: message }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error("Gemini error:", geminiData);
      return NextResponse.json({
        reply:
          geminiData?.error?.message ||
          "AI service error. Please try again.",
      });
    }

    const reply =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sorry, I could not generate a reply right now.";

    return NextResponse.json(
      {
        reply,
        sources: matchedSources,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (err) {
    console.error("[PUBLIC_CHAT_ERROR]", err);
    return NextResponse.json(
      { error: "Server error: " + err.message },
      { status: 500 }
    );
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