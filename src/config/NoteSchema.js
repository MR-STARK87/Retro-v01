const mongoose = require("mongoose");

// Schema for user notes. Stores both Quill delta (for rich editing) and rendered HTML (fast read mode)
// Extended to track a stable client-generated id so offline-created notes can be upserted server-side.
const noteSchema = new mongoose.Schema(
  {
    clientId: { type: String, index: true, unique: true }, // e.g. "note_..." generated in browser
    clientCreatedAt: { type: Date }, // original timestamp from client (first creation in browser)
    clientUpdatedAt: { type: Date }, // last updated timestamp from client when sent
    title: { type: String, trim: true, default: "Untitled Note" },
    // Raw Quill Delta JSON object (stored as mixed for flexibility)
    delta: { type: mongoose.Schema.Types.Mixed },
    // Rendered HTML snapshot for quick display / read mode
    contentHtml: { type: String, default: "" },
    // Plain text (optional) for search indexing
    contentText: { type: String, default: "" },
    tags: { type: [String], index: true, default: [] },
    // Simple user concept - later can be replaced with ref to User
    userId: { type: String, index: true, default: "default" },
    // For potential AI enhanced flag / versioning
    enhanced: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Note", noteSchema);
