export default async function handler(req, res) {
  try {
    const {
      GEMINI_API_KEY,
      KV_REST_API_URL,
      KV_REST_API_TOKEN
    } = process.env;

    const { prompt } = req.query;

    if (!prompt) return res.status(400).json({ error: "Missing prompt" });
    if (!GEMINI_API_KEY) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    if (!KV_REST_API_URL || !KV_REST_API_TOKEN)
      return res.status(500).json({ error: "Missing KV configuration" });

    // 1️⃣ Cache key
    const cacheKey = `img_cache:${prompt}`;

    // 2️⃣ Try KV Cache
    try {
      const cacheRes = await fetch(`${KV_REST_API_URL}/get/${cacheKey}`, {
        headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
      });

      const cached = await cacheRes.json().catch(() => null);

      if (cached?.result) {
        const img = Buffer.from(cached.result, "base64");
        res.setHeader("Content-Type", "image/png");
        return res.send(img);
      }
    } catch (_) {
      // cache fail shouldn't kill app
    }

    // 3️⃣ Call Gemini 2.5 Flash Image
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ]
        })
      }
    );

    const raw = await geminiRes.text();

    if (!geminiRes.ok) {
      return res.status(500).json({
        error: "Gemini failed",
        status: geminiRes.status,
        body: raw
      });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(500).json({
        error: "Gemini returned invalid JSON",
        raw
      });
    }

    const base64 =
      data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64) {
      return res.status(500).json({
        error: "Gemini returned no image",
        response: data
      });
    }

    // 4️⃣ Save to KV cache (90 days)
    try {
      await fetch(`${KV_REST_API_URL}/set/${cacheKey}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KV_REST_API_TOKEN}`,
          "Content-Type": "text/plain"
        },
        body: base64
      });

      await fetch(`${KV_REST_API_URL}/expire/${cacheKey}/7776000`, {
        headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
      });
    } catch (_) {}

    // 5️⃣ Return image
    const img = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", "image/png");
    res.send(img);

  } catch (err) {
    console.error("IMAGE API FAILED:", err);
    res.status(500).json({
      error: "Image service failed",
      details: err?.message || err
    });
  }
}
