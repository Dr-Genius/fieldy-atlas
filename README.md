# Atlas — Chief of Staff (Next.js app)

A real running app: Next.js App Router, live Supabase data, interactive knowledge graph.

## Run locally
```
npm install
cp .env.example .env.local   # fill in SUPABASE_SERVICE_ROLE_KEY
npm run dev                  # http://localhost:3000
```
Without env vars it runs in demo mode (graph still renders) — never crashes.

## Routes
- `/`              dashboard UI (client nav: Dashboard/Briefs/Emails/Skills/Research/Graph/Settings)
- `/api/dashboard` live Supabase query → events, emails, risks, actions, contacts, KPIs
- `/api/graph`     live knowledge graph (nodes/edges), spec-compliant shapes, demo fallback

## Deploy to Netlify
1. Push this folder to a Git repo connected to Netlify.
2. Netlify auto-detects Next.js (@netlify/plugin-nextjs).
3. Set env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (scope: all).
