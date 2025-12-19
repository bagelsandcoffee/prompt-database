export default async function handler(req, res) {
  try {
    const {
      GEMINI_API_KEY,
      KV_REST_API_URL,
      KV_REST_API_TOKEN
    } = process.env;

    const { prompt } = req.query;

    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    if (!GEMINI_API_KEY)
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN)
      return res.status(500).json({ error: "Missing KV configuration" });


    // =============== CACHE CHECK =================
    const cacheKey = `img_cache:${prompt}`;
    const cacheRes = await fetch(`${KV_REST_API_URL}/get/${cacheKey}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
    });

    const cacheData = await cacheRes.json();
    if (cacheData?.result) {
      const img = Buffer.from(cacheData.result, "base64");
      res.setHeader("Content-Type", "image/png");
      return res.send(img);
    }


    // =============== DAILY LIMIT =================
    const today = new Date().toISOString().slice(0, 10);
    const limitKey = `gemini_daily:${today}`;

    const getCount = await fetch(`${KV_REST_API_URL}/get/${limitKey}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
    });

    const countValue = await getCount.json();
    const count = Number(countValue?.result || 0);

    if (count >= 50) {
      return res.status(429).json({ error: "Daily limit reached" });
    }

    await fetch(`${KV_REST_API_URL}/incr/${limitKey}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
    });

    if (count === 0) {
      await fetch(`${KV_REST_API_URL}/expire/${limitKey}/86400`, {
        headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
      });
    }


    // =============== GEMINI GENERATION =================
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateImages?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: { text: prompt } })
      }
    );

    const data = await response.json();

    if (!data.images?.[0]?.base64)
      return res.status(500).json({ error: "No image generated" });

    const base64 = data.images[0].base64;


    // =============== SAVE TO CACHE =================
    await fetch(`${KV_REST_API_URL}/set/${cacheKey}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`,
        "Content-Type": "text/plain"
      },
      body: base64
    });

    await fetch(`${KV_REST_API_URL}/expire/${cacheKey}/2592000`, { // 30 days
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
    });


    // Return Image
    const img = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", "image/png");
    res.send(img);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Image service failed" });
  }
}
