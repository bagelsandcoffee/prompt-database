export default async function handler(req, res) {
  try {
    const { GEMINI_API_KEY, KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
    const { prompt } = req.query;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
      return res.status(500).json({ error: "Missing Vercel KV configuration" });
    }

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt parameter" });
    }

    // ====== DAILY LIMIT LOGIC ======
    const today = new Date().toISOString().slice(0, 10);
    const key = `gemini_daily_count:${today}`;

    const countRes = await fetch(`${KV_REST_API_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
    });

    const currentValue = await countRes.json();
    const currentCount = Number(currentValue?.result || 0);

    if (currentCount >= 50) {
      return res.status(429).json({
        error: "Daily image limit reached. Try again tomorrow."
      });
    }

    // increment
    await fetch(`${KV_REST_API_URL}/incr/${key}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
    });

    // Set expiry only if first count
    if (currentCount === 0) {
      await fetch(`${KV_REST_API_URL}/expire/${key}/86400`, {
        headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
      });
    }

    // ====== GEMINI IMAGE GENERATION ======
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateImages?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: {
            text: prompt
          }
        })
      }
    );

    const data = await response.json();

    if (!data.images || !data.images[0]?.base64) {
      return res.status(500).json({ error: "No image generated" });
    }

    const img = Buffer.from(data.images[0].base64, "base64");

    res.setHeader("Content-Type", "image/png");
    res.send(img);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Image generation failed" });
  }
}
