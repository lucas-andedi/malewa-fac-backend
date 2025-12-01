import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { rbac } from '../../middlewares/rbac';
import { asyncHandler } from '../../utils/http';

export const supportRouter = Router();

/**
 * @swagger
 * /api/v1/support:
 *   post:
 *     summary: Create support ticket
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subject, message]
 *             properties:
 *               subject:
 *                 type: string
 *               message:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *     responses:
 *       201:
 *         description: Ticket created
 */
supportRouter.post('/', rbac(['client', 'merchant', 'courier', 'admin']), asyncHandler(async (req: Request, res: Response) => {
  const { subject, message, priority } = req.body as { subject: string; message: string; priority?: string };
  const userId = (req as any).user.id;

  if (!subject || !message) return res.status(400).json({ error: { message: 'Subject and message are required' } });

  const p = priority || 'medium';
  
  // Use raw SQL because Prisma Client generation is locked
  // Table name is usually SupportTicket in Prisma MySQL unless mapped
  await prisma.$executeRaw`
    INSERT INTO SupportTicket (userId, subject, message, priority, status, createdAt, updatedAt)
    VALUES (${userId}, ${subject}, ${message}, ${p}, 'open', NOW(), NOW())
  `;

  res.status(201).json({ ok: true });
}));

/**
 * @swagger
 * /api/v1/support/me:
 *   get:
 *     summary: Get my tickets
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of tickets
 */
supportRouter.get('/me', rbac(['client', 'merchant', 'courier', 'admin']), asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  
  const tickets = await prisma.$queryRaw`
    SELECT * FROM SupportTicket WHERE userId = ${userId} ORDER BY createdAt DESC
  `;
  
  res.json(tickets);
}));

/**
 * @swagger
 * /api/v1/support/admin:
 *   get:
 *     summary: List all tickets (admin)
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all tickets
 */
supportRouter.get('/admin', rbac(['admin', 'superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const tickets = await prisma.$queryRaw`
    SELECT t.*, u.name as userName, u.email as userEmail, u.role as userRole 
    FROM SupportTicket t
    JOIN User u ON t.userId = u.id
    ORDER BY t.createdAt DESC
  `;
  res.json(tickets);
}));

/**
 * @swagger
 * /api/v1/support/{id}/status:
 *   patch:
 *     summary: Update ticket status (admin)
 *     tags: [Support]
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, resolved, closed]
 *     responses:
 *       200:
 *         description: Status updated
 */
supportRouter.patch('/:id/status', rbac(['admin', 'superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { status } = req.body; // 'open', 'resolved', 'closed'

  if (!status) return res.status(400).json({ error: { message: 'Status required' } });

  await prisma.$executeRaw`
    UPDATE SupportTicket SET status = ${status}, updatedAt = NOW() WHERE id = ${id}
  `;

  res.json({ ok: true });
}));
