const voyager = require('../../services/voyagerService');
const config = require('../../config');
const apiError = require('../../utils/apiError');
const mapper = require('./profileMapper');
const { publicIdFromUrl } = require('./profileValidation');

const getProfileByUrl = async url => {
    const publicId = publicIdFromUrl(url);

    if (!config.linkedin.liAt || !config.linkedin.jsessionId) {
        throw apiError(500, 'LI_AT and JSESSIONID are not configured');
    }

    const [profile, topCard] = await Promise.all([
        voyager.lookupProfile(publicId),
        voyager.lookupProfile(publicId, voyager.TOP_CARD_DECORATION).catch(() => null)
    ]);

    const profileUrn = mapper.profileUrnOf(profile);

    if (!profileUrn) {
        throw apiError(404, 'profile not found');
    }

    const sections = await voyager.fetchSections(publicId, profileUrn);

    return mapper.toProfile(publicId, { profileUrn, profile, topCard, sections });
};

module.exports = { getProfileByUrl };
