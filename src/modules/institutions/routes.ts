import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../utils/http';

import { rbac } from '../../middlewares/rbac';

export const institutionsRouter = Router();

/**
 * @swagger
 * /api/v1/institutions:
 *   get:
 *     summary: List institutions
 *     tags: [Institutions]
 *     responses:
 *       200:
 *         description: List of institutions
 */
institutionsRouter.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const list = await prisma.institution.findMany({
    orderBy: { name: 'asc' }
  });
  res.json(list);
}));

/**
 * @swagger
 * /api/v1/institutions:
 *   post:
 *     summary: Create institution
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Institution created
 */
institutionsRouter.post('/', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const { code, name } = req.body;
  if (!code || !name) return res.status(400).json({ error: { message: 'Code and Name required' } });
  const inst = await prisma.institution.create({ data: { code, name } });
  res.status(201).json(inst);
}));

/**
 * @swagger
 * /api/v1/institutions/{id}:
 *   put:
 *     summary: Update institution
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Institution updated
 */
institutionsRouter.put('/:id', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { code, name } = req.body;
  const inst = await prisma.institution.update({ where: { id }, data: { code, name } });
  res.json(inst);
}));

/**
 * @swagger
 * /api/v1/institutions/{id}:
 *   delete:
 *     summary: Delete institution
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Institution deleted
 */
institutionsRouter.delete('/:id', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await prisma.institution.delete({ where: { id } });
  res.json({ success: true });
}));
