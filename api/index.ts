import { VercelRequest, VercelResponse } from '@vercel/node';

const baseApi = (request: VercelRequest, response: VercelResponse) => {
  response.setHeader('Content-Type', 'text/plain');
  response.send('Try /api/pokedex or /api/game');
};

export default baseApi;
