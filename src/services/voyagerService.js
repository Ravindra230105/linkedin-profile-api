const axios = require('axios');
const config = require('../config');
const apiError = require('../utils/apiError');

const BASE_URL = 'https://www.linkedin.com/voyager/api';

const TOP_CARD_DECORATION = 'com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-6';

const SECTION_FINDERS = {
    positions      : 'profilePositions',
    educations     : 'profileEducations',
    skills         : 'profileSkills',
    certifications : 'profileCertifications',
    languages      : 'profileLanguages'
};

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

const client = axios.create({ baseURL: BASE_URL, timeout: 20000 });

const headers = publicId => {
    const { liAt, jsessionId } = config.linkedin;

    return {
        'cookie'                    : `li_at=${liAt}; JSESSIONID="${jsessionId}"; liap=true`,
        'csrf-token'                : jsessionId,
        'x-restli-protocol-version' : '2.0.0',
        'accept'                    : 'application/vnd.linkedin.normalized+json+2.1',
        'x-li-lang'                 : 'en_US',
        'user-agent'                : USER_AGENT,
        'referer'                   : `https://www.linkedin.com/in/${publicId}/`
    };
};

const get = async (path, publicId) => {
    let response;

    try {
        response = await client.get(path, { headers: headers(publicId), validateStatus: () => true });
    } catch (error) {
        throw apiError(502, `could not reach linkedin: ${error.message}`);
    }

    if (response.status === 401 || response.status === 403) {
        throw apiError(502, 'linkedin rejected the session - the cookies are expired or the csrf token does not match');
    }

    if (response.status === 429 || response.status === 999) {
        throw apiError(502, 'linkedin is rate limiting or blocking this request');
    }

    if (response.status === 404) {
        throw apiError(404, 'profile not found');
    }

    if (response.status !== 200) {
        throw apiError(502, `unexpected ${response.status} from linkedin`);
    }

    if (!response.data || typeof response.data !== 'object') {
        throw apiError(502, 'linkedin returned a challenge page instead of json');
    }

    return response.data;
};

const lookupProfile = (publicId, decorationId) => {
    const query = `q=memberIdentity&memberIdentity=${encodeURIComponent(publicId)}`;
    const path = `/identity/dash/profiles?${query}` + (decorationId ? `&decorationId=${decorationId}` : '');

    return get(path, publicId);
};

const fetchSections = async (publicId, profileUrn) => {
    const names = Object.keys(SECTION_FINDERS);

    const bodies = await Promise.all(names.map(name => {
        const path = `/identity/dash/${SECTION_FINDERS[name]}` +
            `?q=viewee&profileUrn=${encodeURIComponent(profileUrn)}`;

        return get(path, publicId).catch(error => {
            console.warn(`${publicId}: ${name} failed - ${error.message}`);

            return null;
        });
    }));

    return Object.fromEntries(names.map((name, index) => [name, bodies[index]]));
};

module.exports = { TOP_CARD_DECORATION, lookupProfile, fetchSections };
