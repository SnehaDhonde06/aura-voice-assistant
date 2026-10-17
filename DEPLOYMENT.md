# Deployment Guide

## Architecture

GitHub repo
├── server/ → deployed on Render (free tier)
└── client/ → deployed on Vercel (free tier)


## Backend — Render

1. Go to render.com → New → Web Service
2. Connect GitHub repo: `SnehaDhonde06/aura-voice-assistant`
3. Settings:
   - Root directory: `server`
   - Build command: `npm install && npm run build`
   - Start command: `node dist/index.js`
   - Instance type: Free

4. Environment variables:

| Variable | Value |
|---|---|
| PORT | 8787 |
| LLM_PROVIDER | gemini |
| GEMINI_API_KEY | your key from aistudio.google.com |
| GEMINI_MODEL | gemini-3.8-flash |
| GEMINI_FALLBACK_MODELS | gemini-3.5-flash-lite |
| GROQ_API_KEY | your key from console.groq.com |
| GROQ_MODEL | llama-3.1-8b-instant |
| CORS_ORIGIN | your Vercel URL (add after step below) |

5. Deploy. Copy the Render URL.

## Frontend — Vercel

1. Go to vercel.com → New Project
2. Import the same GitHub repo
3. Settings:
   - Root directory: `client`
   - Framework: Vite (auto-detected)

4. Environment variables:

| Variable | Value |
|---|---|
| VITE_API_URL | your Render URL from above |
| VITE_TTS_PROVIDER | browser |

5. Deploy. Copy the Vercel URL.

## Final step: update CORS on Render

Go back to Render → Environment → add: