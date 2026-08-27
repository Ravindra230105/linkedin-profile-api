const notFound = (req, res) =>
    res.status(404).json({ error: `route ${req.method} ${req.originalUrl} not found` });

const errorHandler = (error, req, res, next) => {
    const statusCode = error.statusCode || 500;

    if (statusCode >= 500) {
        console.error(`${req.method} ${req.originalUrl} - ${error.message}`);
    }

    return res.status(statusCode).json({ error: error.message || 'internal server error' });
};

module.exports = { notFound, errorHandler };
