### 🚴‍♂️ activitrax-api
[https://activitrax.app](https://activitrax.app)

---

### 🛠️ Local Development Setup

#### 1. Create a `.env` file in the project root:

```env
AUTH0_M2M_CLIENT_ID=m2m-client-id
AUTH0_M2M_CLIENT_SECRET=m2m-client-secret
AUTH0_AUDIENCE=auth0-audience
AUTH0_ISSUER_URL=https://your-tenant.us.auth0.com
AUTH0_TOKEN_URL=https://your-tenant.us.auth0.com/oauth/token
AUTH0_API_URL=https://your-tenant.us.auth0.com/api/v2
MONGO_URI=mongodb://localhost:27017/your-database-name
SPOTIFY_CLIENT_ID=spotify-client-id
SPOTIFY_CLIENT_SECRET=spotify-client-secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/callback
STRAVA_CLIENT_ID=strava-client-id
STRAVA_CLIENT_SECRET=strava-client-secret
STRAVA_CALLBACK_URL=http://localhost:3000/strava/callback
STRAVA_WEBOHOOK_VERIFY_TOKEN=strava-webhook-verify-token
```

---

#### 2. Install Node Version Manager and dependencies:

```bash
nvm install 22
nvm use 22
npm install
```

---

#### 3. Run the application:

```bash
npm run dev
```
