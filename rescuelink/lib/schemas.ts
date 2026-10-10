import { z } from "zod";

export const roleSchema = z.enum(["citizen", "hospital", "ambulance"]);
export const capabilitySchema = z.enum(["trauma", "cardiac", "neuro", "burns", "pediatric", "obstetric", "general"]);
export const imageMimeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);

const cnicSchema = z.string().regex(/^(?:\d{13}|\d{5}-\d{7}-\d)$/, "must be 13 digits, with optional dashes");
const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

// Base64 without the data: prefix, max 4 MB decoded (CLAUDE.md image rule).
const imageSchema = z
  .string()
  .min(1)
  .refine((s) => !s.startsWith("data:"), "send base64 without the data: prefix")
  .refine((s) => s.length * 0.75 <= 4 * 1024 * 1024, "image must be 4 MB or smaller");

export const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(6, "password must be at least 6 characters"),
  role: roleSchema,
  display_name: z.string().min(1).max(100),
  phone: z.string().min(1).nullish(),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const citizenProfileSchema = z.object({
  cnic: cnicSchema,
  cnic_source: z.enum(["typed", "scanned"]),
  full_name: z.string().min(1).max(120),
  date_of_birth: dateSchema.nullish(),
  gender: z.enum(["male", "female", "other"]).nullish(),
  blood_group: z.string().min(1).max(5).nullish(),
  conditions: z.array(z.string().min(1)),
  allergies: z.array(z.string().min(1)),
  medications: z.array(z.string().min(1)),
  emergency_contact: z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.email().nullish(),
    relation: z.string().min(1),
  }),
});

export const scanCnicSchema = z.object({
  image_base64: imageSchema,
  mime_type: imageMimeSchema,
  purpose: z.enum(["register", "identify"]),
});

export const triageSchema = z.object({
  description: z.string().min(1).max(2000),
  scene_image_base64: imageSchema.nullish(),
  mime_type: imageMimeSchema.nullish(),
  cnic: cnicSchema.nullish(),
});

export const incidentCreateSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  address: z.string().nullish(),
  description: z.string().min(1).max(2000),
  reporter_name: z.string().nullish(),
  reporter_phone: z.string().nullish(),
  for_self: z.boolean().nullish(),
  cnic: cnicSchema.nullish(),
  scene_image_base64: imageSchema.nullish(),
  mime_type: imageMimeSchema.nullish(),
});

export const hospitalClaimSchema = z.object({
  hospital_id: z.string().min(1),
});

export const hospitalCreateSchema = z.object({
  name: z.string().min(1).max(150),
  lat: latSchema,
  lng: lngSchema,
  address: z.string().nullish(),
  phone: z.string().nullish(),
});

export const hospitalUpdateSchema = z
  .object({
    capabilities: z.array(capabilitySchema).min(1).optional(),
    er_beds_available: z.number().int().min(0).nullish(),
    accepting: z.boolean().optional(),
    phone: z.string().nullish(),
  })
  .refine((o) => Object.keys(o).length > 0, "send at least one field to update");

export const readinessSchema = z.object({
  readiness: z.enum(["preparing", "ready"]),
});

export const ambulanceSetupSchema = z.object({
  call_sign: z.string().min(1).max(30),
  service_name: z.string().min(1).max(100),
  vehicle_type: z.enum(["ALS", "BLS"]),
  plate: z.string().nullish(),
});

export const ambulanceStatusSchema = z.object({
  status: z.enum(["available", "offline"]),
});

export const ambulanceLocationSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  accuracy_m: z.number().min(0).nullish(),
});

export const assignmentStatusSchema = z.object({
  status: z.enum(["at_scene", "transporting", "arrived"]),
});

// Query string for GET /api/hospitals?near=lat,lng
export const nearQuerySchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, "near must look like 33.6426,72.9905");
