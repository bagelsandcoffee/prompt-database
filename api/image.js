export default async function handler(req, res) {
  try {
    const {
      GEMINI_API_KEY,
      KV_REST_API_URL,
      KV_REST_API_TOKEN
    } = process.env;

    const { prompt } = req.query;

    // ---- BASIC VALIDATION ----
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt parameter" });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
      return res.status(500).json({ error: "Missing KV configuration" });
    }


    // ---- 1️⃣ CHECK CACHE ----
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


    // ---- 2️⃣ CALL GEMINI ----
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateImages?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: { text: prompt }
        })
      }
    );

    const raw = await geminiRes.text();   // <-- safer
    let data = null;

    try {
      data = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({
        error: "Gemini returned NON-JSON response",
        raw
      });
    }

    // ---- 3️⃣ VALIDATE GEMINI RESPONSE ----
    if (!data?.images?.[0]?.base64) {
      return res.status(500).json({
        error: "Gemini didn’t return an image",
        gemini_response: data
      });
    }

    const base64 = data.images[0].base64;


    // ---- 4️⃣ SAVE TO CACHE ----
    await fetch(`${KV_REST_API_URL}/set/${cacheKey}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`,
        "Content-Type": "text/plain"
      },
      body: base64
    });

    await fetch(`${KV_REST_API_URL}/expire/${cacheKey}/7776000`, { // 90 days
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
    });


    // ---- 5️⃣ RETURN IMAGE ----
    const img = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", "image/png");
    res.send(img);

  } catch (err) {
    console.error("IMAGE API FAILED:", err);
    res.status(500).json({
      error: "Image service failed (detailed)",
      details: err?.message || err
    });
  }
}
