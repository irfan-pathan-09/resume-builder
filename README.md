# Resume Builder (Vercel + Hostinger Ready)

## Routes
- `/` -> Public resume showcase (landing page)
- `/showcase` -> Public resume showcase
- `/admin` -> Admin resume builder

## API Endpoints
- `GET /api/resumes`
- `GET /api/resumes/:id`
- `POST /api/resumes` (requires `X-API-Key`)
- `PUT /api/resumes/:id` (requires `X-API-Key`)
- `DELETE /api/resumes/:id` (requires `X-API-Key`)
- `GET /api/metadata/skills`
- `GET /api/metadata/tags`
- `GET /api/metadata/degrees`
- `GET /api/metadata/countries`

## Vercel Deployment
1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Set environment variable:
   - `ADMIN_API_KEY=your_secret_admin_key`
4. Deploy.

## Hostinger/FileZilla Deployment (Apache + PHP)
1. Open Hostinger File Manager or FileZilla.
2. Upload this full project to `public_html` (or your domain root), including:
   - `.htaccess`
   - `api/`
   - `public/`
   - `db.json`
3. Ensure PHP is enabled (default on Hostinger shared hosting).
4. Set `db.json` writable permissions (typically `664` or `666` if needed).
5. Open your domain:
   - `/` -> public landing page
   - `/admin` -> admin builder

## Notes
- this is for only testing purposes
- This project now uses Vercel Serverless Functions in `/api`.
- For Vercel, runtime data is initialized from `db.json` and stored in serverless temp storage during execution.
- For Hostinger, API is handled by PHP files under `api/` and writes directly to `db.json`.
