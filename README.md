# NUMO — English Number Listening Trainer

English number, date, and year listening flashcards for Japanese learners.

Render app:

https://flashcard2-yiaq.onrender.com/

This version runs through Render so the browser never sees the OpenAI API key.

The old GitHub Pages URL redirects to the Render app:

https://vascdmedical-arch.github.io/flashcard2/

## Render setup

Use this repository as a Render Blueprint or Web Service.

- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/status`
- Environment variable: `OPENAI_API_KEY`
- Optional environment variable: `OPENAI_MODEL`（default: `gpt-4.1-mini`）

`render.yaml` is included. If you create the service from Blueprint, Render will ask for `OPENAI_API_KEY` because it is marked `sync: false`.

## How it works

- Browser loads the app from Render.
- The app calls `/api/questions` on the same Render service.
- The Render server calls OpenAI Responses API using `OPENAI_API_KEY`.
- If the key is missing or the API call fails, the app falls back to built-in local questions.

## Local run

```bash
npm install
OPENAI_API_KEY="your_api_key" npm start
```

Then open `http://127.0.0.1:4173`.
