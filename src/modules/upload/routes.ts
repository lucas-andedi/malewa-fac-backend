import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/http';
import { rbac } from '../../middlewares/rbac';
import { uploadMiddleware, uploadToSpaces } from '../../utils/upload';

export const uploadRouter = Router();

// POST /api/v1/upload
// Uploads a file to DigitalOcean Spaces and returns the URL
uploadRouter.post('/', rbac(['admin', 'merchant']), uploadMiddleware.single('image'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: { message: 'No image file provided' } });
  }

  const publicUrl = await uploadToSpaces(req.file);

  res.status(201).json({ 
    url: publicUrl,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype
  });
}));

