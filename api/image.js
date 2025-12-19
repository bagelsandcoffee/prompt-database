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

    // 1️⃣ CACHE CHECK
    const cacheKey = `img_cache:${prompt}`;
    const cacheRes = await fetch(`${KV_REST_API_URL}/get/${cacheKey}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
    });

    const cached = await cacheRes.json().catch(() => null);
    if (cached?.result) {
      const img = Buffer.from(cached.result, "base64");
      res.setHeader("Content-Type", "image/png");
      return res.send(img);
    }

    // 2️⃣ CORRECT MODERN GEMINI IMAGE ENDPOINT
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagegeneration:generate?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: {
            text: prompt
          },
          aspectRatio: "1:1",          // or "16:9", "4:5", etc.
          size: "1024x1024"            // supported sizes: 512, 768, 1024
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

    if (!data?.generatedImages?.[0]?.image?.base64) {
      return res.status(500).json({
        error: "Gemini did not return an image",
        response: data
      });
    }

    const base64 = data.generatedImages[0].image.base64;

    // 3️⃣ SAVE CACHE
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

    // 4️⃣ RETURN IMAGE
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
