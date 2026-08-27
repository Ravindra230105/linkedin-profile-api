# LinkedIn Profile API

Takes a LinkedIn profile URL and returns the profile as JSON.

```
GET /api/profile?url=https://www.linkedin.com/in/john-doe
GET /health
```

## Setup

```
npm install
cp .env.example .env
npm start
```

`.env` needs two cookies from a logged-in LinkedIn session:

```
LI_AT=AQEDAT...
JSESSIONID=ajax:1234567890123456789
```

Both come from DevTools > Application > Cookies on linkedin.com after logging in. `JSESSIONID`
keeps its `ajax:` prefix but drop the surrounding quotes. Use a throwaway account, not your own.

## Layout

```
src/
  server.js                          starts the http listener
  app.js                             express app, middleware, error handlers
  config/index.js                    env
  routes/index.js                    mounts the modules under /api
  middlewares/errorHandler.js        notFound and the error responder
  utils/apiError.js                  error carrying an http status code
  services/voyagerService.js         talks to linkedin: headers, calls, status mapping
  modules/profile/
    profileRoutes.js
    profileController.js             request in, json out
    profileService.js                orchestrates the seven calls
    profileMapper.js                 voyager entities -> our response
    profileValidation.js             profile url -> publicId
```

Controllers do no work beyond calling the service and handing errors to `next`. The service knows
the order the calls have to happen in but nothing about HTTP, and `voyagerService.js` is the only
file that knows LinkedIn exists.

## Response

```json
{
  "publicId": "john-doe",
  "profileUrn": "urn:li:fsd_profile:ACoAAB...",
  "name": "John Doe",
  "firstName": "John",
  "lastName": "Doe",
  "headline": "Backend Engineer at Acme",
  "location": "Bengaluru, Karnataka, India",
  "about": "...",
  "profileImage": "https://media.licdn.com/...",
  "bannerImage": "https://media.licdn.com/...",
  "experience": [
    {
      "title": "Backend Engineer",
      "company": "Acme",
      "location": "Bengaluru, India",
      "startDate": "Jan 2023",
      "endDate": null,
      "description": "..."
    }
  ],
  "education": [
    {
      "school": "JECRC",
      "degree": "B.Tech",
      "fieldOfStudy": "Computer Science",
      "startDate": "2019",
      "endDate": "2023",
      "grade": null,
      "description": null
    }
  ],
  "skills": ["Project Management", "Software Development"],
  "certifications": [
    {
      "name": "AWS Certified Developer",
      "issuer": "Amazon Web Services (AWS)",
      "licenseNumber": "ABC123",
      "issuedOn": "Jan 2026",
      "expiresOn": "Apr 2031",
      "url": null
    }
  ],
  "languages": [
    { "name": "English", "proficiency": "Full professional proficiency" },
    { "name": "Hindi", "proficiency": "Professional working proficiency" }
  ]
}
```

An `endDate` of `null` on an experience or education entry means it is still current. Fields the
profile doesn't have come back as `null`, and empty sections come back as `[]`.

A certification's dates are its issue and expiry date rather than a period worked, so they are
named `issuedOn` and `expiresOn`. Language proficiency arrives as an enum
(`FULL_PROFESSIONAL`) and is mapped to the label the profile page displays; an unrecognised
value passes through unchanged.

Errors are `{ "error": "..." }` with a 400 for a URL that isn't a LinkedIn profile, 404 when the
profile doesn't resolve, and 502 when LinkedIn rejects, blocks or challenges the call.

## Approach

LinkedIn's public API can't do this. Sign In with LinkedIn returns a name and an avatar for the
user who just logged in, and there is no self-serve endpoint that returns an arbitrary third
party's profile - that sits behind their partner programs.

So this talks to Voyager, the internal API that linkedin.com's own web app calls, carrying the
session cookies as request headers. No browser or headless browser is involved.

Voyager exposes three generations of endpoint side by side: the legacy REST routes, the newer
"dash" REST routes, and GraphQL. I went looking at all three:

- `/identity/profiles/{publicId}/profileView`, the old single call that returned a whole
  profile, now answers **410 Gone**.
- The GraphQL route works but only accepts pre-registered queries, identified by a hash that
  changes with every client release (`queryId=voyagerIdentityDashProfiles.<32 hex chars>`).
  Building on it means re-harvesting hashes from the web client whenever they rotate.
- The **dash REST routes still work undecorated**, and that's what this uses. They return typed
  entities with real field names, need no query hash, and have nothing in them that expires.

Seven calls make up one profile:

```
/identity/dash/profiles?q=memberIdentity&memberIdentity=<publicId>
    -> the full Profile entity: names, headline, about, images, and the profile urn

/identity/dash/profiles?q=memberIdentity&memberIdentity=<publicId>&decorationId=<WebTopCardCore-6>
    -> the same lookup decorated, which is what resolves the location urn to a place name

/identity/dash/profilePositions?q=viewee&profileUrn=<urn>
/identity/dash/profileEducations?q=viewee&profileUrn=<urn>
/identity/dash/profileSkills?q=viewee&profileUrn=<urn>
/identity/dash/profileCertifications?q=viewee&profileUrn=<urn>
/identity/dash/profileLanguages?q=viewee&profileUrn=<urn>
```

The two profile lookups run together; the five section calls then run together once the urn is
known, since each one needs it.

Responses use `application/vnd.linkedin.normalized+json+2.1`: entities are deduplicated into a
flat `included` array and `data["*elements"]` lists their urns in display order. `parse.js` reads
that order rather than `included` directly, so experience and education come back newest first
the way the profile page shows them. Images are vector images - a `rootUrl` plus artifacts that
are *not* sorted by size, so the largest is chosen by width rather than by position.

Login is done by hand, once. LinkedIn challenges non-browser login attempts with CAPTCHA and
email verification, so automating it would add risk without adding capability. The cookies are
harvested from a browser session and treated as configuration.

## Known limitations

Voyager returns what the signed-in account is allowed to see. Public figures and out-of-network
profiles do resolve, but a profile that has restricted its visibility will come back thinner.
This is a property of the approach rather than a bug in the code.

Sections that a profile hasn't filled in return an empty array, which is indistinguishable from a
section that exists but isn't visible to this session.

Only the five sections named in the response above are read. Projects, publications, volunteering
and honours have their own dash finders and would follow the same pattern.

LinkedIn blocks datacenter IP ranges. The same cookies that work locally can be met with a 429 or
a challenge page from a cloud host, which surfaces as a 502. Routing outbound traffic through a
proxy via `HTTPS_PROXY` is the workaround. Below the HTTP layer, TLS fingerprinting can also
distinguish Node's handshake from Chrome's regardless of the headers.

Sessions expire. When `LI_AT` goes stale the API returns 502 saying so, and the cookies have to
be harvested again.

Scraping LinkedIn this way is against their User Agreement and the account holding the session
can be restricted, which is why this runs on a throwaway account.
