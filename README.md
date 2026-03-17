# activitrax-api

**Live app:** [activitrax.app](https://activitrax.app)

REST API that connects Strava and Spotify — automatically captures the music you listened to during a workout and saves it as a tracklist for each activity.

### How it works

1. User connects their Strava + Spotify accounts via OAuth2
2. Strava fires a webhook when an activity is completed
3. API fetches the songs played during that time window from Spotify
4. Tracklist is saved and optionally written back to the Strava activity description

### Built with

Node.js · Express · MongoDB · Auth0 · Strava API · Spotify API

### Features

- OAuth2 integration with Strava and Spotify (token refresh + revocation handling)
- Real-time webhook processing for new activities
- Liked tracks system
- Role-based access control (user/admin)
- In-app feedback and support system

<details>
<summary><h3>Local Development</h3></summary>

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
STRAVA_CALLBACK_URL=https://your-tunnel-subdomain.trycloudflare.com/api/v1/strava/webhook_callback
STRAVA_WEBHOOK_VERIFICATION_TOKEN=strava-webhook-verify-token
STRAVA_WEBHOOK_SUBSCRIPTION_ID=strava-webhook-subscription-id
ADMIN_AUTH0_UID=your-auth0-user-id
```

---

#### 2. Install Node Version Manager and dependencies:

```bash
nvm install 22
nvm use 22
npm install
```

---

#### 3. Set up Cloudflare Tunnel (only needed for testing Strava webhooks):

Skip this step if you don't need to test webhook functionality. Strava webhooks require a publicly accessible URL, so use Cloudflare Tunnel to expose your local API:

```bash
# Install cloudflared
brew install cloudflared

# Start the tunnel
cloudflared tunnel --url http://localhost:4000
```

Copy the generated URL (e.g., `https://abc123.trycloudflare.com`) and update `STRAVA_CALLBACK_URL` in your `.env`.

---

#### 4. Configure Auth0 for Postman:

To test API endpoints locally with Postman, you need to set up OAuth 2.0 authentication.

**Quick option:** Log in to [activitrax.app](https://activitrax.app) and navigate to **Settings** to view your API access token.

**In Auth0 Dashboard:**
1. Go to **Applications → Your SPA App → Settings**
2. Make sure Postman's callback URL is in **Allowed Callback URLs** (Postman displays its callback URL in the OAuth 2.0 config)
3. Save changes

**In Postman:**
1. Open your collection (or a request) and go to the **Authorization** tab. Tip: Configure this at the collection level so all requests inherit the token automatically.
2. Select **OAuth 2.0** as the type
3. Configure a new token with these settings:
   - **Grant Type**: Authorization Code
   - **Auth URL**: `https://your-tenant.us.auth0.com/authorize?audience=YOUR_AUTH0_AUDIENCE`
   - **Access Token URL**: `https://your-tenant.us.auth0.com/oauth/token`
   - **Client ID**: Your SPA app's Client ID (not the M2M app)
   - **Scope**: `openid profile email`
4. Click **Get New Access Token**
5. Log in via the browser popup
6. Use the returned token for API requests

---

#### 5. Run the application:

```bash
npm run dev
```

</details>
