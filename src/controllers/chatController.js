const { Groq } = require("groq-sdk");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const { json } = require("stream/consumers");

// In‑memory store (TODO: replace with persistent storage / DB collection for scalability)
const chatHistories = {};

// Load base system prompts once at startup
const answeringPrompt = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "answeringPrompt.txt"),
  "utf8"
);
const contextPrompt = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "contextPrompt.txt"),
  "utf8"
);
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- Utility helpers ------------------------------------------------------

// Safely parse an assistant JSON message content to extract {response, meta}
function extractAssistantMeta(messageContent) {
  if (!messageContent) return { response: null, meta: null };
  try {
    const trimmed = messageContent.trim();
    // Find the first '{' and last '}' to be tolerant of accidental wrapping text
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1) return { response: null, meta: null };
    const jsonSlice = trimmed.slice(start, end + 1);
    const parsed = JSON.parse(jsonSlice);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Object.prototype.hasOwnProperty.call(parsed, "meta")
    ) {
      return { response: parsed.response ?? null, meta: parsed.meta ?? null };
    }
    return { response: null, meta: null };
  } catch (e) {
    return { response: null, meta: null };
  }
}

// Build a compact history summary from prior assistant meta fields + recent user turns
function buildConversationSummary(historyArr) {
  if (!historyArr || historyArr.length === 0) return "(no prior history)";

  // Only look at last up to 16 messages for summarization efficiency
  const recent = historyArr
    .slice(-16)
    .map((item) => {
      try {
        return JSON.parse(item);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);

  const metaSnippets = [];
  const recentUserPrompts = [];
  for (const msg of recent) {
    if (msg.role === "assistant") {
      // Now assistant content already stores only meta string
      if (msg.content && msg.content !== "(no meta extracted)") {
        metaSnippets.push(msg.content);
      }
    } else if (msg.role === "user") {
      // Keep a truncated tail of user inputs (first 140 chars)
      const truncated =
        msg.content.length > 140
          ? msg.content.slice(0, 137) + "..."
          : msg.content;
      recentUserPrompts.push(truncated);
    }
  }

  const metaPart = metaSnippets.length
    ? `Prior assistant meta: ${metaSnippets.slice(-6).join(" | ")}`
    : "No prior assistant meta.";
  const userPart = recentUserPrompts.length
    ? `Recent user turns: ${recentUserPrompts.slice(-4).join(" || ")}`
    : "No recent user turns.";
  return `${metaPart} ${userPart}`;
}

// Token-ish length heuristic to avoid exploding context
function trimForContext(messages, maxChars = 12000) {
  let total = 0;
  const reversed = [...messages].reverse();
  const kept = [];
  for (const m of reversed) {
    const len = (m.content || "").length;
    if (total + len > maxChars) break;
    kept.push(m);
    total += len;
  }
  return kept.reverse();
}

const generateResponse = async (req, res) => {
  const { message, userId = "default-user" } = req.body; // Using a default userId for now
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }
  try {
    if (!chatHistories[userId]) {
      chatHistories[userId] = [];
    }

    const history = chatHistories[userId];
    const conversationHistory = history
      .map((item) => {
        try {
          return JSON.parse(item);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);

    // Build a summarized context segment to prepend inside system prompt
    const conversationSummary = buildConversationSummary(history);

    const systemContent = `${answeringPrompt}\n\n[Conversation Summary]\n${conversationSummary}\n\nInstructions: Use summary + visible turns to ensure continuity. Do NOT repeat prior JSON. Provide only the new JSON pair.`;

    const messages = [
      { role: "system", content: systemContent },
      ...conversationHistory,
      { role: "user", content: `${message}` },
    ];

    // Trim if too large
    const trimmedMessages = trimForContext(messages);

    const chatCompletion = await groq.chat.completions.create({
      messages: trimmedMessages,
      model: "meta-llama/llama-4-maverick-17b-128e-instruct",
    });

    const aiResponse = chatCompletion.choices[0].message.content;
    // Extract meta so we only persist compressed memory
    const { meta: assistantMeta } = extractAssistantMeta(aiResponse);
    const storedAssistantMeta = assistantMeta || "(no meta extracted)";

    chatHistories[userId].push(
      JSON.stringify({ role: "user", content: message })
    );
    chatHistories[userId].push(
      JSON.stringify({ role: "assistant", content: storedAssistantMeta })
    );

    // Keep the last 10 pairs (20 messages)
    if (chatHistories[userId].length > 20) {
      chatHistories[userId] = chatHistories[userId].slice(-20);
    }

    res.json(JSON.parse(aiResponse));
  } catch (error) {
    console.error("Error generating response:", error);
    res.status(500).json({ error: "Failed to generate response" });
  }
};

module.exports = {
  generateResponse,
};
