# QueueLess

QueueLess is a frontend prototype backed by Vercel serverless functions and Neon Postgres.

## Local development

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to a Neon Postgres connection string.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

The database starts empty. The API creates the required tables automatically on first request; `schema.sql` is also provided for an explicit migration.

## Production

1. Run `npm run build`.
2. Deploy the repository to Vercel.
3. Add `DATABASE_URL` in the Vercel project environment variables for Preview and Production.
4. Redeploy after adding the variable.

Vercel serves `dist/index.html` and the API functions in `api/`. No seed data is included.