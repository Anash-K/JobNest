import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { NotFoundError, ValidationError } from '../utils/errors';
import { assertPdfBuffer } from '../utils/pdf';
import type { Resume } from '../generated/prisma/client';

export type ResumeDeleteResult = {
  deleted: boolean;
  archived: boolean;
};

const UPLOAD_ROOT = path.resolve(process.cwd(), env.UPLOAD_DIR, 'resumes');

async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
}

/**
 * Assert the resume belongs to this user — return 404 rather than 403
 * to avoid confirming that a resource exists for another tenant.
 */
async function assertOwnership(id: string, userId: string): Promise<Resume> {
  const resume = await prisma.resume.findUnique({ where: { id } });
  if (!resume || resume.userId !== userId) throw new NotFoundError('Resume', id);
  return resume;
}

async function hasHistoricalReferences(resumeId: string): Promise<boolean> {
  const [emails, applications, logs] = await Promise.all([
    prisma.generatedEmail.count({ where: { resumeId } }),
    prisma.application.count({ where: { resumeId } }),
    prisma.emailLog.count({ where: { resumeId } }),
  ]);
  return emails > 0 || applications > 0 || logs > 0;
}

function validateUploadFile(file: Express.Multer.File): void {
  if (file.mimetype !== 'application/pdf') {
    throw new ValidationError('Only PDF resumes are allowed');
  }

  const maxBytes = env.MAX_RESUME_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new ValidationError(`Resume must be under ${env.MAX_RESUME_SIZE_MB}MB`);
  }

  assertPdfBuffer(file.buffer);
}

export const resumeService = {
  /**
   * List all non-archived resumes for the user, default first.
   */
  async list(userId: string): Promise<Resume[]> {
    return prisma.resume.findMany({
      where: { userId, archived: false },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  },

  /**
   * Get the active (non-archived) default resume for the user.
   */
  async getDefault(userId: string): Promise<Resume> {
    const resume = await prisma.resume.findFirst({
      where: { userId, isDefault: true, archived: false },
      orderBy: { updatedAt: 'desc' },
    });
    if (!resume) throw new NotFoundError('Default resume');
    return resume;
  },

  /**
   * Get a single resume by id, asserting ownership.
   */
  async getById(id: string, userId: string): Promise<Resume> {
    return assertOwnership(id, userId);
  },

  /**
   * Resolve a resume for email generation:
   *   - if resumeId provided, use it (ownership checked)
   *   - otherwise fall back to the user's default resume
   */
  async resolveResumeId(userId: string, resumeId?: string): Promise<Resume> {
    if (resumeId) {
      const resume = await this.getById(resumeId, userId);
      if (resume.archived) {
        throw new ValidationError('Cannot use an archived resume for new drafts');
      }
      return resume;
    }
    try {
      return await this.getDefault(userId);
    } catch {
      throw new ValidationError('No resume specified and no default resume set');
    }
  },

  /**
   * Upload a new resume.
   * If isDefault is true, atomically demote all other resumes for this user.
   */
  async upload(
    userId: string,
    file: Express.Multer.File,
    name: string,
    isDefault = false,
  ): Promise<Resume> {
    validateUploadFile(file);

    await ensureUploadDir();

    const resume = await prisma.$transaction(async (tx) => {
      const activeCount = await tx.resume.count({
        where: { userId, archived: false },
      });
      const shouldDefault = isDefault || activeCount === 0;

      if (shouldDefault) {
        await tx.resume.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.resume.create({
        data: {
          userId,
          name,
          fileName: file.originalname,
          filePath: '',
          fileSize: file.size,
          isDefault: shouldDefault,
          version: 1,
          originalResumeId: null,
          archived: false,
        },
      });

      const safeName = `${created.id}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = path.join(UPLOAD_ROOT, safeName);
      await fs.writeFile(filePath, file.buffer);

      const updated = await tx.resume.update({
        where: { id: created.id },
        data: { filePath },
      });

      if (shouldDefault) {
        await tx.user.update({
          where: { id: userId },
          data: { defaultResumeId: updated.id },
        });
      }

      return updated;
    });

    return resume;
  },

  /**
   * Replace an existing resume with a new version.
   *
   * The original resume is archived (not deleted) so that any GeneratedEmail
   * or Application that referenced it continues to point to the correct file.
   * The new resume is created with an incremented version and an originalResumeId
   * pointing back to the root of the version chain.
   *
   * If the replaced resume was the default, the new version inherits that role.
   */
  async replace(
    userId: string,
    existingId: string,
    file: Express.Multer.File,
    name?: string,
  ): Promise<Resume> {
    validateUploadFile(file);

    const existing = await assertOwnership(existingId, userId);
    if (existing.archived) {
      throw new ValidationError('Cannot replace an archived resume version');
    }

    await ensureUploadDir();

    const rootId = existing.originalResumeId ?? existing.id;
    const nextVersion = existing.version + 1;
    const newName = name ?? existing.name;

    const newResume = await prisma.$transaction(async (tx) => {
      await tx.resume.update({
        where: { id: existing.id },
        data: { archived: true, isDefault: false },
      });

      if (existing.isDefault) {
        await tx.resume.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.resume.create({
        data: {
          userId,
          name: newName,
          fileName: file.originalname,
          filePath: '',
          fileSize: file.size,
          isDefault: existing.isDefault,
          version: nextVersion,
          originalResumeId: rootId,
          archived: false,
        },
      });

      const safeName = `${created.id}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = path.join(UPLOAD_ROOT, safeName);
      await fs.writeFile(filePath, file.buffer);

      const updated = await tx.resume.update({
        where: { id: created.id },
        data: { filePath },
      });

      if (existing.isDefault) {
        await tx.user.update({
          where: { id: userId },
          data: { defaultResumeId: updated.id },
        });
      }

      return updated;
    });

    return newResume;
  },

  /**
   * Get all versions (including archived) of a resume version chain.
   * Accepts either the root id or any child id in the chain.
   */
  async getVersionHistory(userId: string, resumeId: string): Promise<Resume[]> {
    const resume = await assertOwnership(resumeId, userId);
    const rootId = resume.originalResumeId ?? resume.id;

    return prisma.resume.findMany({
      where: {
        userId,
        OR: [{ id: rootId }, { originalResumeId: rootId }],
      },
      orderBy: { version: 'asc' },
    });
  },

  /**
   * Atomically set one resume as the default for this user.
   * Demotes all other resumes for the user in the same transaction.
   * The target resume must not be archived.
   */
  async setDefault(id: string, userId: string): Promise<Resume> {
    const resume = await assertOwnership(id, userId);
    if (resume.archived) {
      throw new ValidationError('Cannot set an archived resume as default');
    }

    return prisma.$transaction(async (tx) => {
      await tx.resume.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
      const updated = await tx.resume.update({
        where: { id },
        data: { isDefault: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: { defaultResumeId: id },
      });
      return updated;
    });
  },

  /**
   * Soft-delete (archive) a resume.
   * The physical file is NOT deleted so that GeneratedEmails retain their
   * attachment references. The resume is simply hidden from normal listings.
   * Archived resumes cannot be set as default.
   */
  async archive(id: string, userId: string): Promise<Resume> {
    const resume = await assertOwnership(id, userId);
    if (resume.archived) {
      throw new ValidationError('Resume is already archived');
    }

    return prisma.$transaction(async (tx) => {
      const data: Partial<Resume> = { archived: true };
      if (resume.isDefault) data.isDefault = false;

      const updated = await tx.resume.update({ where: { id }, data });

      if (resume.isDefault) {
        await tx.user.update({
          where: { id: userId },
          data: { defaultResumeId: null },
        });
      }

      return updated;
    });
  },

  /**
   * Delete or archive a resume per IMPLEMENTATION.md §5.3:
   * archives when referenced by generated emails, applications, or email logs;
   * otherwise hard-deletes the row and physical file.
   */
  async delete(id: string, userId: string): Promise<ResumeDeleteResult> {
    const resume = await assertOwnership(id, userId);

    if (await hasHistoricalReferences(id)) {
      if (resume.archived) {
        return { deleted: false, archived: true };
      }
      await this.archive(id, userId);
      return { deleted: false, archived: true };
    }

    await prisma.$transaction(async (tx) => {
      if (resume.isDefault) {
        await tx.user.update({
          where: { id: userId },
          data: { defaultResumeId: null },
        });
      }
      await tx.resume.delete({ where: { id } });
    });

    try {
      await fs.unlink(resume.filePath);
    } catch {
      // file may already be gone; non-fatal
    }

    return { deleted: true, archived: false };
  },

  getAbsolutePath(resume: { filePath: string }): string {
    return resume.filePath;
  },

  /** Absolute path after ownership verification — used by preview/download routes. */
  async getReadableFile(id: string, userId: string): Promise<Resume> {
    const resume = await assertOwnership(id, userId);
    const filePath = this.getAbsolutePath(resume);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundError('Resume file', id);
    }
    return resume;
  },
};
