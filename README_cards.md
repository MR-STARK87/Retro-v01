# Retro Cards Integration

This document explains how to use `cardsFinal.html` with the existing card backend.

## Serve & Open

1. Start the server (from repo root):
   - `node src/index.js`
2. Visit: `http://localhost:5000/cardsFinal.html`

Because `express.static` was added pointing at the project root, the HTML file is served directly.

## Endpoints Used

- `POST /user-card`  
  Body: `{ "title": "Question text", "content": "Answer text", "category": "OptionalCategory" }`  
  Response: `{ id, count:1, cards:[{question,answer}], source:"user" }`

- `POST /card` (AI generation)  
  Body: `{ "note": "Topic or source text", "maxCards": 10 }`  
  Response: `{ id, noteHash, count, cards:[...], cached: boolean }`

- `GET /cards/:id` (Not yet wired in UI, available for future retrieval of a known card set id)

## What the Frontend Does

- Intercepts the existing Create Card modal save button; sends data to `/user-card`.
- Intercepts the Generate AI Cards modal; sends topic to `/card`.
- Newly returned card sets are flattened and displayed immediately.
- Category filter dynamically updates based on backend provided categories.
- Editing / deleting backend cards is not implemented yet (requires new endpoints). Local sample cards (if any) still use old client-only logic.

## Next Improvements (Optional)

- Add `GET /cards` endpoint to list recent sets.
- Implement `PATCH /cards/:setId` & `DELETE /cards/:setId` for editing & deleting.
- Persist categories per individual card or add tagging.
- Add pagination or lazy loading once card volume grows.

## Troubleshooting

| Symptom                                  | Likely Cause                                 | Fix                                                            |
| ---------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| Network error on create/generate         | Server not running or CORS blocked           | Ensure `node src/index.js` is active; CORS middleware present. |
| Generated cards show cached unexpectedly | Duplicate topic/note text                    | Change note text or clear Mongo collection.                    |
| Page 404                                 | Open correct URL with port in console output | Use the printed port (default 5000).                           |

## Security Note

Do not expose this backend publicly without rate limiting & auth; AI generation costs and data privacy concerns apply.

---

Happy studying!
