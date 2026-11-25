import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createAccountsRouter } from './accounts/accounts-router.js';
import { createListingsRouter } from './listings/listings-router.js';

export function createApp({ allowedOrigins, getDatabaseStatus, useDatabase = false, fallbackListings = [], accounts }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: allowedOrigins }));

  app.get('/api/v1/health', (_request, response) => {
    response.set('Cache-Control', 'no-store').json({
      status: 'ok',
      database: getDatabaseStatus(),
    });
  });

  app.use('/api/v1/listings', createListingsRouter({ useDatabase, fallbackListings }));
  app.use('/api/v1/account', createAccountsRouter(accounts));

  app.use((_request, response) => {
    response.status(404).json({ error: 'Route not found' });
  });

  app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    if (error.status === 400) return response.status(400).json({ error: 'Invalid request.' });
    if (error.status === 415) return response.status(415).json({ error: 'Unsupported request format.' });
    if (error.status === 413) return response.status(413).json({ error: 'This request is too large.' });

    console.error('API request failed', error.name);
    response.status(500).json({ error: 'Something went wrong. Try again shortly.' });
  });

  return app;
}
