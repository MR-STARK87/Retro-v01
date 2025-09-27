const express = require("express");
const router = express.Router();
const { generateCards } = require("../controllers/cardsController");

// POST /cards/generate - body: { noteContent: string }
router.post("/cards/generate", generateCards);

module.exports = router;
