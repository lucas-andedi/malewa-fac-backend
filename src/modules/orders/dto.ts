import { z } from 'zod';

export const CreateOrderSchema = z.object({
  body: z.object({
    customerName: z.string().min(1),
    customerUserId: z.number().int().positive().optional(),
    restaurantId: z.number().int().positive(),
    items: z.array(z.object({ 
      dishId: z.number().int().positive(), 
      qty: z.number().int().positive().min(1),
      customPrice: z.number().positive().optional() 
    })).min(1),
    deliveryMethod: z.enum(['pickup','campus','offcampus']),
    paymentMethod: z.enum(['mobile','card','cod']),
    address: z.string().optional(),
    notes: z.string().optional(),
    estimatedDistanceKm: z.number().positive().optional(),
    paymentIntentId: z.string().optional(),
  })
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>["body"];
