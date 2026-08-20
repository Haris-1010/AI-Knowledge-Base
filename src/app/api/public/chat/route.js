import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import config from "../../../../lib/config";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonWithCors(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...(init.headers || {}), ...CORS_HEADERS },
  });
}

async function callGroq({ groqKey, message, systemPrompt }) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.6,
      max_tokens: 700,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Groq API error (${res.status}): ${errBody}`);
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("Groq returned empty response");
  return text;
}

async function callGemini({ geminiKey, message, systemPrompt }) {
  const geminiModel = "gemini-flash-latest";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;

  const res = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: message }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.6, maxOutputTokens: 700 },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errBody}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

async function callMuapi({ muapiKey, message, systemPrompt }) {
  const response = await fetch("https://api.muapi.ai/api/v1/any-llm-models", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": muapiKey,
    },
    body: JSON.stringify({
      prompt: message,
      system_prompt: systemPrompt,
      model: "google/gemini-2.5-flash",
      temperature: 0.6,
      max_tokens: 700,
    }),
  });

  if (!response.ok) {
    throw new Error(`Upstream LLM error: ${response.statusText}`);
  }

  const resJson = await response.json();
  const requestId = resJson.request_id;
  if (!requestId) throw new Error("Missing request ID from MuAPI");

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  let status = "processing";
  let attempts = 0;
  const maxAttempts = 15;
  let completedText = "";

  while (attempts < maxAttempts) {
    await delay(1500);
    attempts++;

    const pollRes = await fetch(
      `https://api.muapi.ai/api/v1/predictions/${requestId}/result`,
      { headers: { "x-api-key": muapiKey } }
    );

    if (pollRes.ok) {
      const pollJson = await pollRes.json();
      status = pollJson.status || "processing";

      if (status === "completed") {
        completedText = pollJson.outputs?.[0] || "";
        break;
      } else if (status === "failed") {
        throw new Error("Upstream LLM execution failed.");
      }
    }
  }

  if (status !== "completed") {
    throw new Error("Upstream request timed out.");
  }

  return completedText;
}

export async function POST(req) {
  try {
    const { kbId, message } = await req.json();

    if (!kbId || !message || !message.trim()) {
      return jsonWithCors(
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
      return jsonWithCors(
        { error: "Knowledge base not found" },
        { status: 404 }
      );
    }

    // 2. Sources nikaalo
    const sources = await prisma.source.findMany({
      where: { knowledgeBaseId: kbId },
    });

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
        .slice(0, 4);

      const MAX_SOURCE_CHARS = 800;

      if (scored.length > 0) {
        matchedSources = scored.map((item) => ({
          name: item.source.name,
          type: item.source.type,
        }));

        contextBlock = scored
          .map((item, idx) => {
            const trimmed =
              item.source.content.length > MAX_SOURCE_CHARS
                ? item.source.content.substring(0, MAX_SOURCE_CHARS) + "..."
                : item.source.content;
            return `[SOURCE ${idx + 1}: ${item.source.name} (${item.source.type})]\n${trimmed}\n`;
          })
          .join("\n---\n");
      } else {
        contextBlock = sources
          .slice(0, 4)
          .map((s, idx) => {
            const trimmed =
              s.content.length > MAX_SOURCE_CHARS
                ? s.content.substring(0, MAX_SOURCE_CHARS) + "..."
                : s.content;
            return `[SOURCE ${idx + 1}: ${s.name} (${s.type})]\n${trimmed}\n`;
          })
          .join("\n---\n");
      }
    }

    if (!contextBlock.trim()) {
      return jsonWithCors({
        reply:
          "This knowledge base has no trained content yet. Please add Q&A, files, or URLs first.",
      });
    }

    const systemPrompt = `You are a helpful AI assistant for the "${kb.name}" knowledge base.

RULES:
- Answer ONLY using the knowledge base documents below.
- Be clear, concise, professional, friendly, and natural.
- Do not invent facts or information outside the knowledge base.
- If the documents do not contain the answer, clearly say that you don't have that information.
- When listing multiple items, ALWAYS put each item on a separate line.
- Use the "•" character for bullet points instead of "*" or "-".
- Keep a blank line between bullet points so the response is easy to read.
- When a service, product, feature, or other item has a description, use this format:
  • **Name:** Description
- Keep the name/title of each item bold.
- Do not use numbered lists unless the user specifically asks for numbers.
- Do not use Markdown headings such as #, ##, or ### unless necessary.
- Start answers naturally and avoid unnecessary introductions.
- Keep your answer under 150 words unless the user specifically asks for more detail.

KNOWLEDGE BASE DOCUMENTS:
${contextBlock}

User Question: "${message}"`;

    // Try providers in order: Groq (fast + free + stable) → Gemini → MuAPI
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const muapiKey = config.ai.apiKey;

    const useGroq = Boolean(groqKey && groqKey.trim().length > 0 && !groqKey.includes("your_"));
    const useGemini = Boolean(geminiKey && geminiKey.trim().length > 0 && !geminiKey.includes("your_"));
    const useMuapi = Boolean(muapiKey && !muapiKey.includes("your_") && muapiKey.trim() !== "");

    let reply = "";
    const errors = [];

    if (useGroq) {
      try {
        reply = await callGroq({ groqKey, message, systemPrompt });
      } catch (e) {
        console.error("[GROQ_FAILED]", e.message);
        errors.push(e.message);
      }
    }

    if (!reply && useGemini) {
      try {
        reply = await callGemini({ geminiKey, message, systemPrompt });
      } catch (e) {
        console.error("[GEMINI_FAILED]", e.message);
        errors.push(e.message);
      }
    }

    if (!reply && useMuapi) {
      try {
        reply = await callMuapi({ muapiKey, message, systemPrompt });
      } catch (e) {
        console.error("[MUAPI_FAILED]", e.message);
        errors.push(e.message);
      }
    }

    if (!reply) {
      console.error("[PUBLIC_CHAT_ALL_FAILED]", errors.join(" | "));
      return jsonWithCors({
        reply: "Sorry, I'm having trouble responding right now. Please try again in a moment.",
      });
    }

    return jsonWithCors({
      reply,
      sources: matchedSources,
    });
  } catch (err) {
    console.error("[PUBLIC_CHAT_ERROR]", err);
    return jsonWithCors(
      { error: "Server error: " + err.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}