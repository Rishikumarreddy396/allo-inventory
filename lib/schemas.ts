import { z } from "zod";

export const CreateReservationSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  warehouseId: z.string().min(1, "warehouseId is required"),
  units: z.number().int().positive("units must be a positive integer"),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;