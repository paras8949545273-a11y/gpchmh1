# Student ID Card Portal

An online student application, review, approval, and ID-card download portal for Government Polytechnic College, Hanumangarh.

## Online storage

Student accounts, application details, statuses, and portal settings are stored in Netlify Database. Student photos are stored in Netlify Blobs. A student can apply on one device and see the same application after signing in on another device, while an administrator sees the shared application queue.

Passwords are salted and hashed on the server. Login sessions and role checks are also enforced by the server: students receive only their own data, and administrators can access all student applications.

## Main workflows

- Students can register, log in, submit an application, track review status, correct a rejected application, and download an approved ID card.
- Administrators can view the shared queue, search and filter applications, edit submitted details, mark reviews, approve or reject applications, and maintain the card letterhead settings.
- Photos and application records persist across devices and deployments.

## Admin access

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the Netlify site's environment variables before production use. If they are not set, the development fallback is `admin` / `admin123`.

## Data setup

The Drizzle schema is defined in `db/schema.ts`. Netlify automatically applies the checked-in migration from `netlify/database/migrations` during deployment and provisions the database on first connection.

## Local development

Run the portal through Netlify Dev so the Functions, Database, and Blobs integrations are available:

```bash
netlify dev --port 8889
```

The static files are `index.html`, `style.css`, and `app.js`. The protected API is in `netlify/functions/portal.mts`.
