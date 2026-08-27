const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(cors());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
