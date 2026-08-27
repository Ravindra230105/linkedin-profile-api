const profileService = require('./profileService');

const getProfile = async (req, res, next) => {
    try {
        const profile = await profileService.getProfileByUrl(req.query.url);

        return res.json(profile);
    } catch (error) {
        return next(error);
    }
};

module.exports = { getProfile };
