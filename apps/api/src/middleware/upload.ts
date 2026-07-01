import multer from 'multer';
import { env } from '../config/env';

/** In-memory storage for resume PDFs — files moved to disk in service layer. */
export const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_RESUME_SIZE_MB * 1024 * 1024 },
});
