import { Router, Request, Response } from 'express';

export const healthRouter = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns the API status
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});
