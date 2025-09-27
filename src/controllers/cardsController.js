const { Groq } = require("groq-sdk");
const dotenv = require("dotenv");
dotenv.config();

let groqClient;
try {
  if (process.env.GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  } else {
    console.warn("GROQ_API_KEY not set – /cards/generate disabled");
  }
} catch (e) {
  console.warn("Failed to init Groq client", e);
}

// System prompt: instruct model to ONLY output strict JSON with two fields
// { count: number, cards: [{ title: string, content: string }, ...] }
// Cards should be distilled, study-friendly flashcards derived from note content.
const SYSTEM_PROMPT = `You are an expert flashcard generator.

You will receive RAW NOTE CONTENT from a user (could be messy, partial, or verbose). Your job is to create concise, information‑dense study flashcards.

CRITICAL OUTPUT FORMAT (MUST be valid JSON ONLY – no markdown, no commentary):
{
  "count": <integer number of cards>,
  "cards": [
    { "title": "...", "content": "..." },
    ...
  ]
}

RULES:
1. Return ONLY JSON – no prose before or after.
2. Use "count" equal to the length of the "cards" array.
3. Each card must have a short, specific title (3–10 words) – no numbering.
4. content should be a clear, self‑contained explanation, definition, process steps, or Q→A style answer (avoid references like "above" or "this note").
5. Prefer 5–15 cards unless the content is extremely short (then fewer) or very long (cap at ~25 to avoid overload).
6. If note content is empty or trivial, return { "count": 0, "cards": [] }.
7. Do NOT fabricate facts; if uncertain, exclude or mark succinctly with "(clarify)".
8. Combine overlapping facts; avoid duplicate cards.
9. No code execution; if code present, create cards summarizing purpose, complexity, gotchas.
10. Absolutely NO new fields besides count & cards.
`;

function buildUserPrompt(rawNote = "") {
  return `RAW_NOTE_START\n${rawNote}\nRAW_NOTE_END\nGenerate optimized flashcards now.`;
}

async function generateCards(req, res) {
  if (!groqClient) {
    return res.status(501).json({ error: "Groq client not configured" });
  }
  try {
    const { noteContent } = req.body || {};
    if (typeof noteContent !== "string" || noteContent.trim().length === 0) {
      return res.status(400).json({ error: "noteContent (string) required" });
    }

    const completion = await groqClient.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 1800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(noteContent.slice(0, 12000)) },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content?.trim() || "";

    // Attempt robust JSON extraction in case model wraps text accidentally
    let jsonText = raw;
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonText = raw.slice(firstBrace, lastBrace + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.warn("Failed to parse model JSON for /cards/generate", e, raw);
      return res.status(502).json({
        error: "Model output not valid JSON",
        raw,
      });
    }

    // Structural validation
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray(parsed.cards) ||
      typeof parsed.count !== "number"
    ) {
      return res.status(422).json({
        error: "Invalid structure returned by model",
        raw: parsed,
      });
    }

    // Ensure count matches
    parsed.count = parsed.cards.length;

    // Sanitize each card minimally
    parsed.cards = parsed.cards
      .filter(
        (c) =>
          c &&
          typeof c.title === "string" &&
          typeof c.content === "string" &&
          c.title.trim() &&
          c.content.trim()
      )
      .map((c) => ({
        title: c.title.trim().slice(0, 120),
        content: c.content.trim().slice(0, 1200),
      }));
    parsed.count = parsed.cards.length;

    return res.json(parsed);
  } catch (err) {
    console.error("/cards/generate error", err);
    return res.status(500).json({ error: "Failed to generate cards" });
  }
}

module.exports = { generateCards };
