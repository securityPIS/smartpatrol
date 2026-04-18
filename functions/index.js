import { onRequest } from 'firebase-functions/v2/https';

const TRUSTED_TIME_REGION = 'asia-southeast2';

export const getServerTime = onRequest(
  {
    region: TRUSTED_TIME_REGION,
    maxInstances: 5,
  },
  (request, response) => {
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    response.set('Cache-Control', 'no-store, max-age=0');
    response.set('Pragma', 'no-cache');

    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    if (request.method !== 'GET') {
      response.status(405).json({
        error: 'Method not allowed',
      });
      return;
    }

    const serverNowMs = Date.now();

    response.status(200).json({
      serverNowMs,
      issuedAt: new Date(serverNowMs).toISOString(),
      source: 'firebase-functions',
      timezone: 'UTC',
    });
  },
);
