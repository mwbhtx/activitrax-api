# Activitrax TODO

## Features

- [ ] Add support for additional music services (Apple Music, YouTube Music, etc.)
- [ ] Allow users to customize tracklist format in Strava description
- [ ] Add activity reprocessing feature (manually trigger tracklist fetch for past activities)

## Infrastructure

- [ ] Document MongoDB schema (users collection fields and their purposes)
- [ ] Add rate limiting for Strava/Spotify API calls
- [ ] Add monitoring/alerting for token revocation events
- [ ] Consider caching service validation to reduce API calls on repeated config fetches

## Testing

- [ ] Add unit tests for token revocation detection logic
- [ ] Add integration tests for disconnect flows (app-initiated and service-initiated)
- [ ] Test edge cases: revoke on Strava/Spotify then attempt various app actions

## Technical Debt

- [ ] Review error handling consistency across API modules
- [ ] Standardize logging format for easier debugging
