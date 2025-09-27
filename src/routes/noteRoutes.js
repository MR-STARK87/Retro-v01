const express = require("express");
const router = express.Router();
const {
  upsertNote,
  listNotes,
  getNote,
  deleteNote,
  enhanceNote,
} = require("../controllers/noteController");

// Matches frontend POST from notesFinal.html (currently posts to http://localhost:3000/notes)
router.post("/notes", upsertNote);
router.post("/notes/enhance", enhanceNote);
router.get("/notes", listNotes);
router.get("/notes/:clientId", getNote);
router.delete("/notes/:clientId", deleteNote);

module.exports = router;
