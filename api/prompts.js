export default async function handler(req, res) {
  const { NOTION_TOKEN, DATABASE_ID } = process.env;

  if (!NOTION_TOKEN || !DATABASE_ID) {
    return res.status(500).json({ error: "Missing environment variables" });
  }

  try {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          page_size: 100,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Notion API Error:", errorData);
      return res.status(500).json({ error: "Notion API error" });
    }

    const data = await response.json();

    const prompts = data.results.map((p) => ({
      id: p.id,
      title: p.properties.Title?.title?.[0]?.plain_text || "",
      category: p.properties.Category?.select?.name || "General",
      prompt: p.properties.Prompt?.rich_text?.[0]?.plain_text |
