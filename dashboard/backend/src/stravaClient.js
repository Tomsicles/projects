const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";

export function buildAuthorizeUrl(redirectUri) {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "activity:read_all",
    approval_prompt: "auto",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function postToken(body) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      ...body,
    }),
  });
  if (!res.ok) {
    const err = new Error(`Strava token endpoint failed: ${res.status} ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_at,
  };
}

export function exchangeCodeForToken(code) {
  return postToken({ code, grant_type: "authorization_code" });
}

export function refreshAccessToken(refreshToken) {
  return postToken({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

export async function fetchActivitiesSince(accessToken, afterEpochSeconds) {
  const perPage = 100;
  const activities = [];
  let page = 1;
  while (true) {
    const url = new URL(ACTIVITIES_URL);
    url.searchParams.set("after", String(afterEpochSeconds));
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = new Error(`Strava activities endpoint failed: ${res.status} ${await res.text()}`);
      err.status = res.status;
      throw err;
    }
    const batch = await res.json();
    activities.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return activities;
}
