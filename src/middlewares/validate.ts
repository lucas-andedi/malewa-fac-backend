import { AnyZodObject } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const validate = (schema: AnyZodObject) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = { body: req.body, query: req.query, params: req.params };
    await schema.parseAsync(data);
    next();
  } catch (err: any) {
    return res.status(400).json({ error: { message: 'Validation error', details: err.errors } });
  }
};
