import { Router } from 'express';
import { paramId } from '../utils/params';
import fs from 'fs';
import { asyncHandler } from '../middleware/error-handler';
import { requireOwnership } from '../middleware/ownership';
import { resumeUpload } from '../middleware/upload';
import { ok } from '../utils/response';
import { resumeService } from '../services/resume.service';
import { ValidationError } from '../utils/errors';

const router: Router = Router();

function streamPdf(res: import('express').Response, resume: { fileName: string; filePath: string }, disposition: 'inline' | 'attachment'): void {
  const filePath = resumeService.getAbsolutePath(resume);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${resume.fileName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(filePath).pipe(res);
}

/**
 * GET /api/v1/resumes
 * List all active (non-archived) resumes for the authenticated user.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const resumes = await resumeService.list(req.user!.id);
    res.json(ok(resumes));
  }),
);

/**
 * GET /api/v1/resumes/default
 * Get the active default resume for the authenticated user.
 */
router.get(
  '/default',
  asyncHandler(async (req, res) => {
    const resume = await resumeService.getDefault(req.user!.id);
    res.json(ok(resume));
  }),
);

/**
 * GET /api/v1/resumes/:id
 * Get a single resume by id. Returns 404 if it doesn't belong to the user.
 */
router.get(
  '/:id',
  requireOwnership('resume'),
  asyncHandler(async (req, res) => {
    const resume = await resumeService.getById(paramId(req.params.id), req.user!.id);
    res.json(ok(resume));
  }),
);

/**
 * GET /api/v1/resumes/:id/version-history
 * Return all versions (including archived) in the version chain.
 */
router.get(
  '/:id/version-history',
  requireOwnership('resume'),
  asyncHandler(async (req, res) => {
    const history = await resumeService.getVersionHistory(req.user!.id, paramId(req.params.id));
    res.json(ok(history));
  }),
);

/**
 * GET /api/v1/resumes/:id/preview
 * Stream the PDF inline for browser preview (iframe/object embed).
 */
router.get(
  '/:id/preview',
  requireOwnership('resume'),
  asyncHandler(async (req, res) => {
    const resume = await resumeService.getReadableFile(paramId(req.params.id), req.user!.id);
    streamPdf(res, resume, 'inline');
  }),
);

/**
 * POST /api/v1/resumes
 * Upload a new resume. Multipart/form-data with a 'file' field (PDF).
 * Optional body fields: name (string), isDefault (boolean string).
 */
router.post(
  '/',
  resumeUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('PDF file is required');
    const name =
      (req.body.name as string | undefined)?.trim() ||
      req.file.originalname.replace(/\.pdf$/i, '');
    const isDefault = req.body.isDefault === 'true' || req.body.isDefault === true;
    const resume = await resumeService.upload(req.user!.id, req.file, name, isDefault);
    res.status(201).json(ok(resume));
  }),
);

/**
 * POST /api/v1/resumes/:id/replace
 * Replace an existing resume with a new version.
 * Archives the old version and creates a new child in the version chain.
 */
router.post(
  '/:id/replace',
  requireOwnership('resume'),
  resumeUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('PDF file is required');
    const name = (req.body.name as string | undefined)?.trim();
    const resume = await resumeService.replace(
      req.user!.id,
      paramId(req.params.id),
      req.file,
      name,
    );
    res.status(201).json(ok(resume));
  }),
);

/**
 * PATCH /api/v1/resumes/:id/set-default
 * Promote this resume to the user's default. Clears the flag on all others.
 */
router.patch(
  '/:id/set-default',
  requireOwnership('resume'),
  asyncHandler(async (req, res) => {
    const resume = await resumeService.setDefault(paramId(req.params.id), req.user!.id);
    res.json(ok(resume));
  }),
);

/**
 * PATCH /api/v1/resumes/:id/archive
 * Soft-delete a resume. Preserves the physical file for historical email references.
 */
router.patch(
  '/:id/archive',
  requireOwnership('resume'),
  asyncHandler(async (req, res) => {
    const resume = await resumeService.archive(paramId(req.params.id), req.user!.id);
    res.json(ok(resume));
  }),
);

/**
 * GET /api/v1/resumes/:id/download
 * Stream the PDF file to the client as an attachment.
 */
router.get(
  '/:id/download',
  requireOwnership('resume'),
  asyncHandler(async (req, res) => {
    const resume = await resumeService.getReadableFile(paramId(req.params.id), req.user!.id);
    streamPdf(res, resume, 'attachment');
  }),
);

/**
 * DELETE /api/v1/resumes/:id
 * Archives when historically referenced; otherwise hard-deletes row and file.
 */
router.delete(
  '/:id',
  requireOwnership('resume'),
  asyncHandler(async (req, res) => {
    const result = await resumeService.delete(paramId(req.params.id), req.user!.id);
    res.json(ok(result));
  }),
);

export const resumesRouter = router;
