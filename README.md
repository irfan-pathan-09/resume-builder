# Resume Builder (Vercel Ready)

## Routes
- `/` -> Admin resume builder
- `/admin` -> Admin resume builder
- `/showcase` -> Public resume showcase

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

## Notes
- This project now uses Vercel Serverless Functions in `/api`.
- Runtime data is initialized from `db.json` and stored in serverless temp storage during execution.
