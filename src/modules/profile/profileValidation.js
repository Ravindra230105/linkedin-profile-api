const apiError = require('../../utils/apiError');

const publicIdFromUrl = url => {
    if (!url) {
        throw apiError(400, 'url query parameter is required');
    }

    const match = /linkedin\.com\/in\/([^/?#]+)/i.exec(String(url).trim());

    if (!match) {
        throw apiError(400, 'not a linkedin profile url');
    }

    return decodeURIComponent(match[1]);
};

module.exports = { publicIdFromUrl };
