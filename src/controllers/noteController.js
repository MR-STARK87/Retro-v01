const Note = require("../config/NoteSchema");
const { Groq } = require("groq-sdk");
const dotenv = require("dotenv");
dotenv.config();
let groqClient;
try {
  if (process.env.GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  } else {
    console.warn("GROQ_API_KEY not set – /notes/enhance will return 501");
  }
} catch (e) {
  console.warn("Failed to init Groq client", e);
}

// Helper to extract plain text from HTML (basic strip). We can also rely on client, but server-side ensures search consistency.
function stripHtml(html = "") {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// POST /notes - upsert by client id (id in payload) and return stored note
// Body example sent by frontend (notesFinal.html):
// {
//   id,               // client generated id (note_...)
//   title,
//   html,             // formatted HTML snapshot
//   delta,            // quill delta object
//   createdAt,        // client ISO string
//   updatedAt         // client ISO string
// }
exports.upsertNote = async (req, res) => {
  try {
    const { id, title, html, delta, createdAt, updatedAt } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: "Missing required field: id" });
    }
    // Basic size safety (prevent huge uploads accidentally)
    if (html && html.length > 200_000) {
      return res.status(413).json({ error: "Note too large" });
    }

    const contentText = stripHtml(html || "");
    const update = {
      clientId: id,
      title: title || contentText.slice(0, 40) || "Untitled Note",
      contentHtml: html || "",
      contentText,
      delta: delta || null,
      clientCreatedAt: createdAt ? new Date(createdAt) : undefined,
      clientUpdatedAt: updatedAt ? new Date(updatedAt) : new Date(),
    };

    const note = await Note.findOneAndUpdate(
      { clientId: id },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      success: true,
      note,
    });
  } catch (err) {
    console.error("Error upserting note", err);
    if (err.code === 11000) {
      return res.status(409).json({ error: "Duplicate clientId" });
    }
    return res.status(500).json({ error: "Server error" });
  }
};

// GET /notes - list latest notes (optionally filter by user later)
exports.listNotes = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const notes = await Note.find({ userId: "default" })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .select("clientId title updatedAt createdAt contentText");
    res.json({ notes });
  } catch (err) {
    console.error("Error listing notes", err);
    res.status(500).json({ error: "Server error" });
  }
};

// GET /notes/:clientId - fetch single note
exports.getNote = async (req, res) => {
  try {
    const { clientId } = req.params;
    const note = await Note.findOne({ clientId });
    if (!note) return res.status(404).json({ error: "Not found" });
    res.json({ note });
  } catch (err) {
    console.error("Error fetching note", err);
    res.status(500).json({ error: "Server error" });
  }
};

// DELETE /notes/:clientId - remove a note (not yet wired from frontend)
exports.deleteNote = async (req, res) => {
  try {
    const { clientId } = req.params;
    const deleted = await Note.findOneAndDelete({ clientId });
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting note", err);
    res.status(500).json({ error: "Server error" });
  }
};

// POST /notes/enhance - AI lightly enhances a note preserving voice & structure
// Body: { id?, title, html, delta? }
// Returns: { enhancedMarkdown, enhancedHtml }
exports.enhanceNote = async (req, res) => {
  console.log("Enhance note request received");
  if (!groqClient) {
    return res
      .status(501)
      .json({ error: "Groq client not configured on server" });
  }
  try {
    const { id, title = "Untitled Note", html = "", delta } = req.body || {};
    const plain = stripHtml(html);
    if (!plain) {
      return res.status(400).json({ error: "Note content empty" });
    }

    // System prompt stresses minimal, personality-preserving edits
    const systemPrompt = `You are an expert writing enhancer.

Objective: Enhance the user’s note while preserving their unique voice, intent, emotional tone, and structure.

Guidelines:
1. Maintain the original perspective (first/second/third person) unless correcting clear grammar errors.
2. Preserve meaning, anecdotes, humor, rhetorical style, and informal tone unless they cause confusion or hinder readability.
3. Improve clarity, flow, grammar, punctuation, and tense consistency. Prefer active voice when natural.
4. Maintain domain-specific terminology, technical accuracy, TODO markers, code, inline code, and markdown.
5. Keep structure and order; rearrange only when it significantly improves clarity or impact.
6. Use bullet points or numbered lists where they clearly enhance readability or organization.
7. You may expand on ideas, add helpful context, or enrich descriptions if it aligns with the user’s intent and tone.
8. Avoid unnecessary repetition or filler. Remove only genuine bloat.
9. If the writing is already strong, make subtle refinements rather than aggressive edits.
10. Output must be in GitHub Flavored Markdown, with no preface or commentary—only the enhanced note.
11. If the note is very short, you may enhance more freely and add helpful elaboration.
12. Correct any factual incorrectness if clearly evident, but do not add new facts or references.
`;

    const userPrompt = `Original Note (HTML stripped to text):\n${plain}\n\nIf HTML formatting implies headings or emphasis, reflect with markdown (#, ##, **, _, etc).`;

    const completion = await groqClient.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 1400,
    });

    const enhancedMarkdown =
      completion?.choices?.[0]?.message?.content?.trim() || plain;

    // Basic markdown -> HTML (very minimal). Frontend will also render properly.
    // Keep simple conversion for safety; we rely on client 'marked' for full rendering.
    const escapeHtml = (s = "") =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let enhancedHtml = escapeHtml(enhancedMarkdown)
      // bold **text**
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // italic *text*
      .replace(/(^|\s)\*(?!\*)([^*]+)\*(?=\s|$)/g, "$1<em>$2</em>")
      // headings ###, ##, # (simple)
      .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
      .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
      .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>")
      // inline code
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // unordered list bullets
      .replace(/^(?:- |\* )(.*)$/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`)
      // newlines to paragraphs (very naive)
      .replace(/\n{2,}/g, "</p><p>")
      .replace(/^(.+?)$/gm, "<p>$1</p>");

    // Attempt to update existing note record (optional)
    if (id) {
      await Note.findOneAndUpdate(
        { clientId: id },
        {
          $set: {
            enhanced: true,
            contentHtml: enhancedHtml,
            contentText: stripHtml(enhancedHtml),
            title: title,
            clientUpdatedAt: new Date(),
          },
        },
        { new: true }
      ).catch(() => {});
    }

    res.json({
      success: true,
      enhancedMarkdown,
      enhancedHtml,
      model: "meta-llama/llama-4-maverick-17b-128e-instruct",
    });
  } catch (err) {
    console.error("Error enhancing note", err);
    res.status(500).json({ error: "Failed to enhance note" });
  }
};
