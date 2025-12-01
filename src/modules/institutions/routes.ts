import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../utils/http';

import { rbac } from '../../middlewares/rbac';

export const institutionsRouter = Router();

institutionsRouter.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const list = await prisma.institution.findMany({
    orderBy: { name: 'asc' }
  });
  res.json(list);
}));

institutionsRouter.post('/', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const { code, name } = req.body;
  if (!code || !name) return res.status(400).json({ error: { message: 'Code and Name required' } });
  const inst = await prisma.institution.create({ data: { code, name } });
  res.status(201).json(inst);
}));

institutionsRouter.put('/:id', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { code, name } = req.body;
  const inst = await prisma.institution.update({ where: { id }, data: { code, name } });
  res.json(inst);
}));

institutionsRouter.delete('/:id', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await prisma.institution.delete({ where: { id } });
  res.json({ success: true });
}));
