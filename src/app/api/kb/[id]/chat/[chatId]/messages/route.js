import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../../../../lib/auth";
import { prisma } from "../../../../../../../lib/prisma";
import { UserService } from "../../../../../../../lib/services/user";
import config from "../../../../../../../lib/config";

// Helper sleep delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { chatId } = await params;

    const messages = await prisma.kBMessage.findMany({
      where: {
        chatId: chatId,
        chat: { userId: session.user.id }
      },
      orderBy: { createdAt: "asc" }
    });

    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  let cost = config.ai.chatQueryCost;
  let creditsDeducted = false;
  let userId = null;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = session.user.id;

    const { id, chatId } = await params;
    const body = await req.json();
    const { content, model } = body;

    if (!content || content.trim() === "") {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 });
    }

    const headerApiKey = req.headers.get("x-custom-api-key");
    const customApiKey = headerApiKey || body.customApiKey || session.user.customApiKey || null;
    const isUsingCustomKey = Boolean(customApiKey && customApiKey.trim().length > 0);

    cost = isUsingCustomKey ? 0 : config.ai.chatQueryCost;

    // 1. Verify User Credit Balance (only if not using custom API key)
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    if (!isUsingCustomKey && user.credits < cost) {
      return NextResponse.json({
        error: `Insufficient credits. Query requires ${cost} credits, you have ${user.credits}.`
      }, { status: 402 });
    }

    // 2. Fetch Chat session and KB details
    const chat = await prisma.kBChat.findFirst({
      where: { id: chatId, userId: userId },
      include: { knowledgeBase: true }
    });
    if (!chat) {
      return NextResponse.json({ error: "Chat playground session not found" }, { status: 404 });
    }

    // 3. Vector-like Semantic context search
    const sources = await prisma.source.findMany({
      where: { knowledgeBaseId: id }
    });

    let contextBlock = "";
    let matchedSources = [];

    if (sources.length > 0) {
      // Better keyword extraction: include words >= 2 chars, remove common stop words
      const stopWords = new Set(["the","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","shall","can","need","dare","ought","used","a","an","the","and","or","but","if","then","else","when","at","by","for","with","about","against","between","through","during","before","after","above","below","to","from","up","down","in","out","on","off","over","under","again","further","there","here","this","that","these","those","what","which","who","whom","how","all","each","every","both","few","more","most","other","some","such","no","not","only","own","same","so","than","too","very","just","also","how","its","it","he","she","they","them","his","her","their","my","your","our","me","you","him","us"]);

      const keywords = content.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length >= 2 && !stopWords.has(w));

      const scoredSources = sources.map(s => {
        let score = 0;
        const bodyText = s.content.toLowerCase();
        const title = s.name.toLowerCase();

        if (keywords.length > 0) {
          keywords.forEach(kw => {
            // Exact word match in body
            if (bodyText.includes(kw)) score += 2;
            // Exact word match in title (higher weight)
            if (title.includes(kw)) score += 5;
            // Partial/substring match in body (for fuzzy matching)
            const words = bodyText.split(/\s+/);
            words.forEach(w => {
              if (w.includes(kw) || kw.includes(w)) score += 0.5;
            });
          });
        } else {
          score = 1; // fallback
        }

        return { source: s, score };
      }).filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

      // Take top 5 matches for richer context
      const topMatches = scoredSources.slice(0, 5);
      if (topMatches.length > 0) {
        contextBlock = topMatches.map((item, idx) => {
          matchedSources.push({
            id: item.source.id,
            name: item.source.name,
            type: item.source.type,
            snippet: item.source.content.substring(0, 300) + "..."
          });
          return `[DOCUMENT MATCH ${idx + 1}: ${item.source.name} (Type: ${item.source.type})]\n${item.source.content}\n`;
        }).join("\n---\n");
      }
    }

    // 4. Deduct playground credits (if not using custom API key)
    if (!isUsingCustomKey && cost > 0) {
      await UserService.deductCredits(userId, cost);
      creditsDeducted = true;
    }

    // 5. Save user message first
    const userMsg = await prisma.kBMessage.create({
      data: {
        chatId: chatId,
        role: "user",
        content: content.trim()
      }
    });

    // 6. Upstream AI execution with Google Gemini API (FREE) + MuAPI fallback
    const geminiKey = process.env.GEMINI_API_KEY;
    const muapiKey = isUsingCustomKey ? customApiKey.trim() : config.ai.apiKey;
    const useGemini = Boolean(geminiKey && geminiKey.trim().length > 0 && !geminiKey.includes("your_"));
    let completedText = "";

    if (!useGemini && (!muapiKey || muapiKey.includes("your_") || muapiKey.trim() === "")) {
      // Local Simulator response
      await delay(1200); // realistic feel
      
      if (matchedSources.length > 0) {
        completedText = `## Analysis for "${chat.knowledgeBase.name}"

Based on the matching documents in your knowledge base, I found relevant information across **${matchedSources.length}** source(s):

${matchedSources.map((ms, i) => `### ${i + 1}. ${ms.name} (${ms.type})
> ${ms.snippet}
`).join("\n")}

---

**Summary:**
The above sources contain information related to your query. To get a more detailed and comprehensive answer, please configure a valid API key in your settings — this will enable the full AI engine to analyze, synthesize, and explain the content in depth.

**Tip:** You can add more sources (Q&A pairs, URLs, or text files) in the Sources panel to expand the knowledge base and get even richer responses.`;
      } else {
        completedText = `## Knowledge Base Status: "${chat.knowledgeBase.name}"

I've scanned your workspace, but **no direct matches** were found for your query.

### Current Status:
- **Total Sources Trained:** ${sources.length} source(s)
- **Query Keywords:** ${content.split(/\s+/).filter(w => w.length > 2).join(", ") || "N/A"}

### Recommendations:
1. **Add more sources** — Use the Sources panel to add Q&A pairs, scrape web pages, or paste raw text content.
2. **Rephrase your question** — Try using different keywords or shorter/more specific terms.
3. **Check source content** — Make sure your uploaded sources contain information related to what you're asking.

**Tip:** For best results, add diverse sources covering different aspects of your topic. The more content you provide, the better and more detailed the AI responses will be.`;
      }
    } else {
      // Fetch recent history of this chat session (excluding the current one we just saved)
      const previousMessages = await prisma.kBMessage.findMany({
        where: {
          chatId: chatId,
          id: { not: userMsg.id }
        },
        orderBy: { createdAt: "asc" },
        take: 30
      });

      const pastTurns = previousMessages
        .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      const systemPrompt = `You are a helpful AI assistant for the "${chat.knowledgeBase.name}" knowledge base.

RULES:
- Give CLEAR, CONCISE, and TO-THE-POINT answers. No filler text or unnecessary fluff.
- Answer directly first, then add brief details if needed.
- Use simple bullet points (-) for lists. Keep each point short (1-2 lines max).
- Reference source names when using their content: "According to [Source Name]..."
- If multiple sources apply, combine them into one clean answer.
- If the documents don't have enough info, say what you found and what's missing.
- Keep your answer under 300 words unless the user specifically asks for more detail.
- Do NOT use markdown headings (##). Use plain text with bullet points only.

KNOWLEDGE BASE DOCUMENTS:
${contextBlock || "No matching reference materials loaded."}

CONVERSATION HISTORY:
${pastTurns || "No previous turns."}

User Question: "${content}"`;

      // Build conversation history for Gemini format
      const contents = [];
      previousMessages.forEach(m => {
        contents.push({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.content }]
        });
      });
      // Add current user message
      contents.push({
        role: "user",
        parts: [{ text: content }]
      });

      if (useGemini) {
        // ─── GOOGLE GEMINI API (FREE) ───
        const geminiModel = "gemini-flash-latest";
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;

        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: contents,
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4096
            }
          })
        });

        if (!geminiRes.ok) {
          const errBody = await geminiRes.text();
          throw new Error(`Gemini API error (${geminiRes.status}): ${errBody}`);
        }

        const geminiJson = await geminiRes.json();
        completedText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (!completedText) {
          throw new Error("Gemini returned empty response");
        }

      } else {
        // ─── MUAPI FALLBACK ───
        const response = await fetch("https://api.muapi.ai/api/v1/any-llm-models", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": muapiKey
          },
          body: JSON.stringify({
            prompt: content,
            system_prompt: systemPrompt,
            model: model || "google/gemini-2.5-flash",
            temperature: 0.7,
            max_tokens: 4096
          })
        });

        if (!response.ok) {
          throw new Error(`Upstream LLM error: ${response.statusText}`);
        }

        const resJson = await response.json();
        const requestId = resJson.request_id;

        if (!requestId) {
          throw new Error("Missing request ID from MuAPI");
        }

        // Polling loop
        let status = "processing";
        let attempts = 0;
        const maxAttempts = 15;

        while (attempts < maxAttempts) {
          await delay(1500);
          attempts++;

          const pollRes = await fetch(`https://api.muapi.ai/api/v1/predictions/${requestId}/result`, {
            headers: { "x-api-key": muapiKey }
          });

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
      }
    }

    // 7. Save and commit assistant response
    const assistantMsg = await prisma.kBMessage.create({
      data: {
        chatId: chatId,
        role: "assistant",
        content: completedText || "Success! Let me know if you have other queries.",
        citations: JSON.stringify(matchedSources)
      }
    });

    return NextResponse.json({
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      remainingCredits: isUsingCustomKey ? user.credits : (user.credits - cost)
    });

  } catch (err) {
    console.error("[KB_PLAYGROUND_ERROR]", err);

    // Auto-refund credits to the user if deduction succeeded but generation crashed
    if (creditsDeducted && userId) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { credits: { increment: cost } }
        });
      } catch (refundErr) {
        console.error("[CREDIT_REFUND_FAIL]", refundErr);
      }
    }

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
