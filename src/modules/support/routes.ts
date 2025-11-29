import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { rbac } from '../../middlewares/rbac';
import { asyncHandler } from '../../utils/http';

export const supportRouter = Router();

// Create a ticket
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

// Get my tickets
supportRouter.get('/me', rbac(['client', 'merchant', 'courier', 'admin']), asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  
  const tickets = await prisma.$queryRaw`
    SELECT * FROM SupportTicket WHERE userId = ${userId} ORDER BY createdAt DESC
  `;
  
  res.json(tickets);
}));

// Admin: List all tickets
supportRouter.get('/admin', rbac(['admin']), asyncHandler(async (req: Request, res: Response) => {
  const tickets = await prisma.$queryRaw`
    SELECT t.*, u.name as userName, u.email as userEmail, u.role as userRole 
    FROM SupportTicket t
    JOIN User u ON t.userId = u.id
    ORDER BY t.createdAt DESC
  `;
  res.json(tickets);
}));

// Admin: Update status
supportRouter.patch('/:id/status', rbac(['admin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { status } = req.body; // 'open', 'resolved', 'closed'

  if (!status) return res.status(400).json({ error: { message: 'Status required' } });

  await prisma.$executeRaw`
    UPDATE SupportTicket SET status = ${status}, updatedAt = NOW() WHERE id = ${id}
  `;

  res.json({ ok: true });
}));
