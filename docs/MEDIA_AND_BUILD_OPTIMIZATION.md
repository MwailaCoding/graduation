# Media Offloading & Build Optimization Guide

This document details the configuration and operational best practices for optimizing Docker builds, offloading heavy media (137 MB), and debouncing superseded CI/CD builds in the **mwailatwins** application.

---

## 1. Docker Build Context Optimization (`.dockerignore`)

When Docker builds an image, the client sends all files from the current directory to the Docker daemon before running any `Dockerfile` instructions. Without exclusions, 140+ MB of raw assets, tests, and local caches are transferred over the daemon socket.

### Implemented `.dockerignore` Exclusions
- **Version Control**: `.git`, `.gitignore`
- **Large Raw Media**: `assets/`, `assets/raw/`, `assets/heavy-media/`, `assets/originals/`, and all raw design folders (saves 137+ MB transfer).
- **Testing & Specs**: `tests/`, `*.test.*`, `*.spec.*`, `coverage/`.
- **Markdown & Docs**: `*.md`, `database/*.md`.
- **Local Artifacts & Node Modules**: `node_modules`, `.next`, `out`, `build`, `*.tsbuildinfo`, `next-env.d.ts`.
- **Secrets & Temp Files**: `.env*` (except `.env.example`), `.DS_Store`, `Thumbs.db`.

**Result**: Build context size drops from **>140 MB** down to **<2 MB**, slashing transfer and packaging time from minutes to milliseconds.

---

## 2. Offloading Large Media (137 MB) to Object Storage (Cloudflare R2 / AWS S3 / CDN)

### Architecture
- **Runtime Web Assets (`public/assets/`)**: Pre-optimized, lightweight WebP and compressed JPG files (~1.7 MB total). These serve instant page loads directly from Next.js.
- **Raw / Heavy Media (`assets/`)**: Contains raw originals, uncompressed PNGs, high-resolution textures, and future graduation video footage (~137 MB).
- **Git & Build Protection**: The `assets/*` binary directories are ignored in `.gitignore` and untracked from Git so repositories remain fast to clone and deploy.

### Offload to Cloudflare R2 (Recommended: Zero Egress Fees)
1. **Create an R2 Bucket**:
   Create a bucket in the Cloudflare Dashboard (e.g. `mwaila-graduation-media`).
2. **Sync Media via S3-Compatible CLI or Wrangler**:
   ```bash
   # Using AWS CLI with Cloudflare R2 endpoint
   aws s3 sync assets/ s3://mwaila-graduation-media/assets/ \
     --endpoint-url https://<account_id>.r2.cloudflarestorage.com
   ```
3. **Connect a Custom Domain / Public CDN**:
   Connect a custom domain (e.g., `https://media.mwailatwins.com` or `https://pub-<hash>.r2.dev`).
4. **Next.js Integration**:
   `next.config.ts` is pre-configured with `images.remotePatterns` for `*.r2.dev`, `*.r2.cloudflarestorage.com`, `*.amazonaws.com`, and `*.cloudfront.net`.
   For videos or heavy media in React:
   ```tsx
   <video controls preload="metadata" className="w-full rounded-2xl">
     <source src="https://media.mwailatwins.com/videos/graduation-celebration.mp4" type="video/mp4" />
   </video>
   ```

---

## 3. Debouncing & Canceling Superseded Builds

Pushing multiple commits in rapid succession can trigger consecutive 10-minute builds, clogging CI/CD queues and wasting cloud compute.

### A. Automated Concurrency Cancellation (GitHub Actions)
The workflow at `.github/workflows/ci.yml` is configured with `concurrency` cancellation:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```
*How it works*: If you push commit `A` and then push commit `B` two minutes later, GitHub Actions automatically aborts `A` immediately and runs only `B`.

### B. Hosting Platform Auto-Cancel Settings
- **Render**: Dashboard > Web Service > Settings > Enable **"Auto-Cancel Builds"**.
- **Vercel**: Project Settings > Git > Enable **"Automatically cancel superseded builds"**.
- **Cloudflare Pages**: Settings > Builds & deployments > Toggle on **"Cancel in-progress builds"**.
- **Railway**: Settings > Deployment > Enable **"Cancel Active Builds"**.

### C. Developer Git Workflow Best Practices
1. **Verify Locally Before Pushing**:
   Run local typecheck and production build test before pushing:
   ```bash
   npm run typecheck && npm run build
   ```
2. **Batch Local Commits**:
   Commit as many times as you like locally, but push once when a milestone or batch of work is ready:
   ```bash
   git add .
   git commit -m "feat: complete section update"
   # Only 1 push = only 1 remote build triggered
   git push origin main
   ```
3. **Squash Micro-Commits When Cleaning Up**:
   If you have several small test commits:
   ```bash
   git rebase -i HEAD~3
   ```
