# LMS (EduSync)

Clean project layout:

- `client/` — React + Vite frontend
- `server/` — Express API, MongoDB models, Stripe and Clerk webhooks

There is no nested `LMS/Lms/client` duplicate structure. Open this folder as the project root.

## Local setup

Requirements: Node.js 20.19+ (or a compatible Node 22 release) and npm.

1. Install frontend dependencies: `cd client && npm ci`
2. Copy `client/.env.example` to `client/.env.local` and set `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_BACKEND_URL`.
3. Install backend dependencies: `cd ../server && npm ci`
4. Copy `server/.env.example` to `server/.env` and set real MongoDB, Clerk, Cloudinary and Stripe values.
5. Start the API: `cd server && npm run dev`
6. In another terminal, start the frontend: `cd client && npm run dev`

Do not commit `.env` files. Configure production secrets in the hosting provider's environment settings, not in GitHub.

## Build and checks

- Frontend: `cd client && npm run build`
- Frontend lint: `cd client && npm run lint`
- Backend syntax check: `cd server && npm run check`

## Production notes

- Configure `CLIENT_URL` and `VITE_BACKEND_URL` for the actual deployed domains.
- Configure Stripe webhook at `/stripe` and Clerk webhook at `/clerk` on the backend domain.
- Set `CLERK_PROXY_URL` to the frontend's Clerk proxy URL if using Clerk's proxy mode.
- The Vercel configuration files contain the current project routing/domain assumptions; review the rewrite domains before deploying to a different Vercel project.
- The in-memory rate limiter is per server process and is not a substitute for a shared/distributed rate limit for high-traffic production deployments.
- Test payment checkout and webhook delivery in Stripe test mode before enabling live payments.

## Implemented hardening in this package

- Environment files with secrets removed; safe `.env.example` templates retained.
- Git ignore rules cover secrets, dependency folders, build output and Vercel local state.
- Coupon codes are validated against active dates, minimum amount, course restrictions and usage limit; discount is reflected in Stripe's checkout amount.
- Coupon usage is reserved atomically during checkout and released when a Stripe checkout expires or checkout creation fails.
- Stripe webhook checks that checkout payment is paid before granting enrollment and makes course enrollment count updates conditional to reduce duplicate increments on webhook retries.
- CORS is restricted to configured frontend origins.
- Stripe client initialization is deferred until the payment path is called, so unrelated server routes can load without a Stripe key configured.

This is a code-level cleanup, not a claim that every third-party integration is production-verified. Run the build and checks above, configure secrets, and test login, uploads, payments, webhooks and database migration with test credentials before launch.
