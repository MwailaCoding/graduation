# Majala Mwaila & Florence Achala Mwaila — Graduation Invitation Website

Phase 5.1 project initialization and foundational setup.

## Tech Stack

- **Framework**: Next.js (App Router)
- **UI Library**: React
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL (`pg` server-side `Pool` singleton, no ORM)

## Directory Overview

- `assets/` — Pre-existing Phase 01 curated assets and originals (preserved unmodified)
- `public/assets/` — Static web asset directories (`photos/twins`, `photos/majala`, `photos/florence`, `botanical`, `graduation`, `decorative`, `textures`)
- `src/app/` — Next.js App Router entrypoints (`layout.tsx`, `page.tsx`)
- `src/components/` — Reusable UI components (reserved for Phase 5.2+)
- `src/lib/` — Server utilities, including PostgreSQL client (`db.ts`)
- `src/styles/` — Global design foundation (`globals.css`)
- `src/types/` — Shared TypeScript types (reserved for Phase 5.2+)
- `database/migrations/` — Reserved for post-Phase-5.1 SQL database migrations

## Prerequisites

- Node.js (`v20+`)
- npm
- PostgreSQL database connection string

## Setup Steps

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local environment file from the template and populate the required variable:

   ```bash
   cp .env.example .env.local
   ```

3. Validate TypeScript types:

   ```bash
   npx tsc --noEmit
   ```

4. Run a production build:

   ```bash
   npm run build
   ```

5. Start the local development server:

   ```bash
   npm run dev
   ```

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string stored in `.env.local` (gitignored; never commit secret `.env*` files).
