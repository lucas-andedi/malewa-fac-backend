import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../utils/http';

export const institutionsRouter = Router();

institutionsRouter.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const list = await prisma.institution.findMany({
    orderBy: { name: 'asc' }
  });
  res.json(list);
}));
