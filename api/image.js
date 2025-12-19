export default async function handler(req, res) {
  try {
    const { GEMINI_API_KEY } = process.env;
    const { prompt } = req.query;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt parameter" });
    }

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
