# LinkedIn Profile API

Takes a LinkedIn profile URL and returns the profile as JSON.

## Setup

```
npm install
cp .env.example .env
npm start
```

`.env` needs two cookies from a logged-in LinkedIn session, both from
DevTools > Application > Cookies on linkedin.com:

```
LI_AT=AQEDAT...
JSESSIONID=ajax:1234567890123456789
```

Keep the `ajax:` prefix on `JSESSIONID` but not the quotes around it. Use a throwaway account.

## API

```
GET /health
GET /api/profile?url=https://www.linkedin.com/in/john-doe
```

Profile URLs copied from the browser carry `?trk=...&originalSubdomain=...`, so encode the
parameter:

```
curl --get http://localhost:3000/api/profile \
  --data-urlencode "url=https://www.linkedin.com/in/john-doe"
```

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
  "skills": ["Node.js", "PostgreSQL"],
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

An `endDate` of `null` means the entry is still current. Missing fields are `null` and empty
sections are `[]`. A certification's dates are its issue and expiry, so they are named `issuedOn`
and `expiresOn` rather than start and end.

Errors are `{ "error": "..." }` with a 400 for a url that is not a LinkedIn profile, 404 when the
profile does not resolve, and 502 when LinkedIn rejects or blocks the call.

## Layout

```
src/
  server.js                     starts the listener
  app.js                        express app and error handlers
  config/index.js
  routes/index.js               mounts modules under /api
  middlewares/errorHandler.js
  utils/apiError.js
  services/voyagerService.js    the only file that talks to linkedin
  modules/profile/
    profileRoutes.js
    profileController.js
    profileService.js           orders the calls
    profileMapper.js            linkedin entities -> our response
    profileValidation.js        profile url -> publicId
```

## Approach

LinkedIn's public API cannot do this. Sign In with LinkedIn returns a name and an avatar for the
user who just logged in, and there is no self-serve endpoint that returns someone else's profile.
That sits behind their partner programs.

So this uses Voyager, the internal API that linkedin.com's own web app calls, sending the session
cookies as request headers. No browser or headless browser is involved.

Voyager runs three generations of endpoint side by side, and I tested all three before picking one:

- `/identity/profiles/{publicId}/profileView`, the old call that returned a whole profile in one
  hit, now answers 410 Gone.
- GraphQL works, but only accepts queries LinkedIn has pre-registered, identified by a hash that
  changes with each client release. Building on it means re-harvesting hashes whenever they rotate.
- The dash REST routes still answer undecorated, with no hash involved, and return typed entities
  with real field names. That is what this uses.

Seven calls make up one profile:

```
/identity/dash/profiles?q=memberIdentity&memberIdentity=<publicId>
    the Profile entity: names, headline, about, images, and the profile urn

/identity/dash/profiles?q=memberIdentity&memberIdentity=<publicId>&decorationId=<WebTopCardCore-6>
    the same lookup decorated, which resolves the location urn to a place name

/identity/dash/profilePositions?q=viewee&profileUrn=<urn>
/identity/dash/profileEducations?q=viewee&profileUrn=<urn>
/identity/dash/profileSkills?q=viewee&profileUrn=<urn>
/identity/dash/profileCertifications?q=viewee&profileUrn=<urn>
/identity/dash/profileLanguages?q=viewee&profileUrn=<urn>
```

The two profile lookups run together. The five section calls need the urn the first one returns,
so they wait for it and then run together too.

Two details about the responses shaped `profileMapper.js`. Entities are deduplicated into a flat
`included` array while `data["*elements"]` holds their urns in display order, so the mapper reads
that order instead of `included` directly and experience comes back newest first. And profile
images are a `rootUrl` plus artifacts that are not sorted by size, so the largest one is picked by
width rather than by position.

The `csrf-token` header has to match the `JSESSIONID` cookie exactly or every call comes back 403
with an empty body.

Logging in is done by hand, once. LinkedIn answers non-browser login attempts with CAPTCHA and
email verification, so automating it adds risk without adding anything. The cookies are treated as
configuration.

## Known limitations

Voyager returns what the signed-in account can see. Public figures and out-of-network profiles do
resolve, but a profile that has restricted its visibility comes back thinner.

A section nobody filled in and a section this session cannot see both return `[]`.

Only the five sections above are read. Projects, publications, volunteering and honours have their
own dash finders and would follow the same pattern.

LinkedIn blocks datacenter IP ranges, so the cookies that work locally can be met with a 429 or a
challenge page from a cloud host, which surfaces as a 502. An outbound proxy via `HTTPS_PROXY` is
the workaround. Below the HTTP layer, TLS fingerprinting can tell Node's handshake from Chrome's
regardless of the headers.

Sessions expire. When `LI_AT` goes stale every call returns 502 and the cookies have to be
harvested again.

Reading LinkedIn this way is against their User Agreement and the account holding the session can
be restricted, so it should not be an account you care about.
