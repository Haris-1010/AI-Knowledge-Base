import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { url } = await req.json();

    if (!url || !url.trim()) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL
    let parsedUrl;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    // Fetch the webpage
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KnowledgeBaseBot/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8",
      },
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch: ${response.status} ${response.statusText}` }, { status: 400 });
    }

    const contentType = response.headers.get("content-type") || "";
    const html = await response.text();

    // Extract text content from HTML
    let content = html
      // Remove script and style tags completely
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, "")
      // Remove nav, footer, header elements
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      // Convert common block elements to newlines
      .replace(/<\/(p|div|h[1-6]|li|tr|br\s*\/?)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      // Remove all remaining HTML tags
      .replace(/<[^>]+>/g, " ")
      // Decode HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-zA-Z]+;/g, " ")
      // Collapse whitespace
      .replace(/[ \t]+/g, " ")
      // Collapse multiple newlines
      .replace(/\n\s*\n/g, "\n\n")
      // Trim
      .trim();

    // Limit content length (first ~8000 chars for context)
    if (content.length > 8000) {
      content = content.substring(0, 8000) + "\n\n[Content truncated - showing first 8000 characters]";
    }

    if (content.length < 50) {
      return NextResponse.json({ error: "Could not extract meaningful text from this URL. Try copying the content manually." }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      content: content,
      url: parsedUrl.toString(),
      title: html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || parsedUrl.hostname,
    });

  } catch (err) {
    console.error("[FETCH_URL_ERROR]", err);
    return NextResponse.json({ error: err.message || "Failed to fetch URL content" }, { status: 500 });
  }
}
