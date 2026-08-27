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

LinkedIn's public API cannot do this. Sign In with LinkedIn only gives you the name and photo of
the user who logged in. There is no public endpoint to fetch someone else's profile.

So this calls Voyager, the internal API that linkedin.com uses itself. The session cookies go in as
request headers. No browser is used.

Voyager has three sets of endpoints and I tried all of them:

- the old `/identity/profiles/{publicId}/profileView` returns 410, so it is gone
- GraphQL works, but needs a query hash that changes every time LinkedIn ships a new build
- the dash REST endpoints work with no hash and return clean field names, so I used those

One profile takes seven calls:

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

The two profile lookups run at the same time. The section calls need the urn from the first one, so
they run after it, also at the same time.

Three things I had to work out along the way:

- `csrf-token` has to be the same value as the `JSESSIONID` cookie, or every call returns 403 with
  an empty body
- the data comes back in a flat `included` array, and `data["*elements"]` has the ids in the right
  order, so the mapper follows that order to keep experience newest first
- image sizes are not sorted, so the biggest one is picked by width

Logging in is done by hand, once. LinkedIn asks for a CAPTCHA or an email code when you log in from
a script, so I take the cookies from the browser and keep them in `.env`.

## Known limitations

- you only get what the logged-in account can see, so some profiles come back with less
- an empty section and a hidden section look the same, both return `[]`
- only the five sections above are read - projects, publications and volunteering would need one
  more call each
- LinkedIn blocks cloud IPs, so a deployed instance can get blocked where localhost works. Setting
  `HTTPS_PROXY` is the way around it.
- cookies expire, and after that every call returns 502 until you replace them
