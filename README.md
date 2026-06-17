# SCIM Server

A SCIM 2.0 server for inspecting Okta provisioning traffic. Logs every request and response body as structured JSON so you can see exactly what Okta sends during user and group provisioning operations.

**Stack:** Node.js + Express, PostgreSQL, deployed on [Render](https://render.com).

---

## Deploy to Render

The repo includes a `render.yaml` Blueprint that provisions a web service and a managed Postgres database in one click.

### 1. Fork or push this repo to GitHub

Render deploys from a GitHub repository. Make sure your copy is pushed to a repo you own.

### 2. Create a new Blueprint instance on Render

1. Go to [dashboard.render.com](https://dashboard.render.com) and click **New → Blueprint**.
2. Connect your GitHub account if prompted, then select this repository.
3. Render reads `render.yaml` and shows you the two resources it will create:
   - `scim-server` — the web service
   - `scim-db` — a managed Postgres database
4. Click **Apply**. Render builds and deploys both.

### 3. Get your auth token

Render auto-generates a random `SCIM_AUTH_TOKEN` for you (configured via `generateValue: true` in `render.yaml`).

To find it:
1. Open your `scim-server` service in the Render dashboard.
2. Go to **Environment**.
3. Copy the value of `SCIM_AUTH_TOKEN`.

You'll need this when configuring Okta.

### 4. Find your SCIM base URL

Your service URL will look like `https://scim-server-<hash>.onrender.com`. The SCIM base URL to give Okta is:

```
https://scim-server-<hash>.onrender.com/scim/v2
```

You can find the exact URL on your service's dashboard page.

---

## Connect to Okta

1. In Okta Admin, open the app you want to provision → **Provisioning** → **Configure API Integration**.
2. Check **Enable API Integration**.
3. Set **Base URL** to your Render SCIM URL (`https://your-service.onrender.com/scim/v2`).
4. Set **API Token** to the `SCIM_AUTH_TOKEN` value from Render.
5. Click **Test API Credentials** — you should see a success message.
6. Save and enable the provisioning features you want (Create Users, Update Attributes, Deactivate Users, Push Groups).

---

## View traffic

Every SCIM request Okta makes is logged to stdout as structured JSON, including the full request and response body. View logs in real time from the Render dashboard:

**Service → Logs**

---

## Local development

### Prerequisites

- Node.js 20+
- PostgreSQL running locally

### Setup

```bash
npm install
```

Create a `.env` file:

```
DATABASE_URL=postgres://localhost:5432/scim_server_dev
SCIM_AUTH_TOKEN=dev-token
```

Run migrations and start the server:

```bash
npm run migrate
npm run dev
```

The server starts on port 3000 by default (`PORT` env var overrides this).

### Run tests

Tests require a separate Postgres database. Create a `.env.test` file:

```
DATABASE_URL=postgres://localhost:5432/scim_server_test
SCIM_AUTH_TOKEN=test-token
```

```bash
npm test
```

---

## API

All endpoints are under `/scim/v2` and require `Authorization: Bearer <token>`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/scim/v2/Users` | List users (supports `filter`, `startIndex`, `count`) |
| POST | `/scim/v2/Users` | Create user |
| GET | `/scim/v2/Users/:id` | Get user |
| PUT | `/scim/v2/Users/:id` | Replace user |
| PATCH | `/scim/v2/Users/:id` | Update user (Okta deactivation uses this) |
| DELETE | `/scim/v2/Users/:id` | Delete user |
| GET | `/scim/v2/Groups` | List groups |
| POST | `/scim/v2/Groups` | Create group |
| GET | `/scim/v2/Groups/:id` | Get group |
| PUT | `/scim/v2/Groups/:id` | Replace group |
| PATCH | `/scim/v2/Groups/:id` | Update group members |
| DELETE | `/scim/v2/Groups/:id` | Delete group |
| GET | `/scim/v2/ServiceProviderConfig` | Server capabilities |
| GET | `/scim/v2/ResourceTypes` | Supported resource types |
| GET | `/scim/v2/Schemas` | Supported schemas |
| GET | `/health` | Health check (no auth required) |
