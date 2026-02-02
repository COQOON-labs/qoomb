import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  hiveName: z.string().min(1).max(255),
  adminName: z.string().min(1).max(255),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const createHiveSchema = z.object({
  name: z.string().min(1).max(255),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).max(100),
  adminName: z.string().min(1).max(255),
});
