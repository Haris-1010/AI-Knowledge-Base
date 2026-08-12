export async function GET() {
  try {
    const res = await fetch('https://ezsite.ai/ezsite-chatbot.js', {
      headers: { 'User-Agent': 'easysite-embed-proxy/1.0' },
      next: { revalidate: 3600 } // Cache 1 hour
    });

    if (!res.ok) {
      return new Response('Failed to fetch chatbot script', { status: 502 });
    }

    const js = await res.text();

    return new Response(js, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  } catch (e) {
    console.error('Embed proxy error:', e);
    return new Response('Internal server error', { status: 500 });
  }
}