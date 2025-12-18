export default async function handler(req, res) {
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const DATABASE_ID = process.env.DATABASE_ID;

  if (!NOTION_TOKEN || !DATABASE_ID) {
    return res.status(500).json({ error: "Missing environment variables" });
  }

  const response = await fetch(
    `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
      }
    }
  );

  const data = await response.json();

  const prompts = data.results.map(p => ({
    title: p.properties.Title?.title?.[0]?.plain_text || "",
    category: p.properties.Category?.select?.name || "General",
    prompt: p.properties.Prompt?.rich_text?.[0]?.plain_text || ""
  }));

  res.status(200).json(prompts);
}
