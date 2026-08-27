const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PROFICIENCY = {
    NATIVE_OR_BILINGUAL  : 'Native or bilingual proficiency',
    FULL_PROFESSIONAL    : 'Full professional proficiency',
    PROFESSIONAL_WORKING : 'Professional working proficiency',
    LIMITED_WORKING      : 'Limited working proficiency',
    ELEMENTARY           : 'Elementary proficiency'
};

const typed = (body, typeSuffix) => {
    if (!body || !Array.isArray(body.included)) {
        return [];
    }

    return body.included.filter(entity => (entity.$type || '').endsWith(typeSuffix));
};

const ordered = (body, typeSuffix) => {
    const entities = typed(body, typeSuffix);
    const order = (body && body.data && body.data['*elements']) || [];

    if (!order.length) {
        return entities;
    }

    const byUrn = new Map(entities.map(entity => [entity.entityUrn, entity]));
    const sorted = order.map(urn => byUrn.get(urn)).filter(Boolean);

    return sorted.length ? sorted : entities;
};

const profileUrnOf = body => {
    const profile = (body.included || []).find(entity =>
        typeof entity.entityUrn === 'string' && entity.entityUrn.startsWith('urn:li:fsd_profile:'));

    return profile ? profile.entityUrn : null;
};

const date = value => {
    if (!value || !value.year) {
        return null;
    }

    return value.month ? `${MONTHS[value.month - 1]} ${value.year}` : String(value.year);
};

const range = dateRange => ({
    startDate : date(dateRange && dateRange.start),
    endDate   : date(dateRange && dateRange.end)
});

const image = reference => {
    const vector = reference && (
        (reference.displayImageReference && reference.displayImageReference.vectorImage) ||
        (reference.originalImageReference && reference.originalImageReference.vectorImage) ||
        reference.vectorImage
    );

    if (!vector || !vector.rootUrl || !Array.isArray(vector.artifacts) || !vector.artifacts.length) {
        return null;
    }

    const largest = vector.artifacts.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a));

    return vector.rootUrl + largest.fileIdentifyingUrlPathSegment;
};

const location = (profile, topCard) => {
    const geoUrn = profile.geoLocation && profile.geoLocation.geoUrn;

    if (geoUrn && topCard) {
        const geo = typed(topCard, 'common.Geo').find(entity => entity.entityUrn === geoUrn);

        if (geo && geo.defaultLocalizedName) {
            return geo.defaultLocalizedName;
        }
    }

    return profile.locationName || null;
};

const experience = body => ordered(body, 'profile.Position').map(position => ({
    title       : position.title,
    company     : position.companyName,
    location    : position.locationName || position.geoLocationName || null,
    ...range(position.dateRange),
    description : position.description
}));

const education = body => ordered(body, 'profile.Education').map(entry => ({
    school       : entry.schoolName,
    degree       : entry.degreeName,
    fieldOfStudy : entry.fieldOfStudy,
    ...range(entry.dateRange),
    grade        : entry.grade,
    description  : entry.description
}));

const skills = body => ordered(body, 'profile.Skill').map(skill => skill.name).filter(Boolean);

const certifications = body => ordered(body, 'profile.Certification').map(certification => {
    const dates = certification.dateRange || {};

    return {
        name          : certification.name,
        issuer        : certification.authority,
        licenseNumber : certification.licenseNumber || null,
        issuedOn      : date(dates.start),
        expiresOn     : date(dates.end),
        url           : certification.url || null
    };
});

const languages = body => ordered(body, 'profile.Language').map(language => ({
    name        : language.name,
    proficiency : PROFICIENCY[language.proficiency] || language.proficiency || null
}));

const toProfile = (publicId, { profileUrn, profile, topCard, sections }) => {
    const entity = typed(profile, 'profile.Profile')[0] || {};

    return {
        publicId       : entity.publicIdentifier || publicId,
        profileUrn     : profileUrn,
        name           : [entity.firstName, entity.lastName].filter(Boolean).join(' ') || null,
        firstName      : entity.firstName || null,
        lastName       : entity.lastName || null,
        headline       : entity.headline || null,
        location       : location(entity, topCard),
        about          : entity.summary || null,
        profileImage   : image(entity.profilePicture),
        bannerImage    : image(entity.backgroundPicture),
        experience     : experience(sections.positions),
        education      : education(sections.educations),
        skills         : skills(sections.skills),
        certifications : certifications(sections.certifications),
        languages      : languages(sections.languages)
    };
};

module.exports = { profileUrnOf, toProfile };
