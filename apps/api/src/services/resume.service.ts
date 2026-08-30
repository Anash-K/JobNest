import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { supabase } from '../lib/supabase';
import { NotFoundError, ValidationError, ExternalServiceError } from '../utils/errors';
import { assertPdfBuffer } from '../utils/pdf';
import type { Resume } from '../generated/prisma/client';

export type ResumeDeleteResult = {
  deleted: boolean;
  archived: boolean;
};

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

function sanitizeFileName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return /^\.+$/.test(sanitized) ? 'resume.pdf' : sanitized;
}

function getObjectKey(userId: string, resumeId: string, version: number, fileName: string): string {
  return `users/${userId}/resumes/${resumeId}/v${version}/${sanitizeFileName(fileName)}`;
}

export const resumeService = {
  /**
   * List all non-archived resumes for the user, default first.
   * Only returns fully uploaded resumes (filePath !== '').
   */
  async list(userId: string): Promise<Resume[]> {
    return prisma.resume.findMany({
      where: { userId, archived: false, filePath: { not: '' } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  },

  /**
   * Get the active (non-archived) default resume for the user.
   */
  async getDefault(userId: string): Promise<Resume> {
    const resume = await prisma.resume.findFirst({
      where: { userId, isDefault: true, archived: false, filePath: { not: '' } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!resume) throw new NotFoundError('Default resume');
    return resume;
  },

  /**
   * Get a single resume by id, asserting ownership and ensuring it's ready.
   */
  async getById(id: string, userId: string): Promise<Resume> {
    const resume = await assertOwnership(id, userId);
    if (!resume.filePath) {
      throw new NotFoundError('Resume', id); // It's still pending/uploading
    }
    return resume;
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
   * Upload a new resume using Compensation-Based Consistency.
   */
  async upload(
    userId: string,
    file: Express.Multer.File,
    name: string,
    isDefault = false,
  ): Promise<Resume> {
    validateUploadFile(file);

    // 1. Transaction 1: Create pending record
    const { created, shouldDefault } = await prisma.$transaction(async (tx) => {
      const activeCount = await tx.resume.count({
        where: { userId, archived: false, filePath: { not: '' } },
      });
      const makeDefault = isDefault || activeCount === 0;

      const record = await tx.resume.create({
        data: {
          userId,
          name,
          fileName: file.originalname,
          filePath: '', // PENDING
          fileSize: file.size,
          isDefault: makeDefault,
          version: 1,
          originalResumeId: null,
          archived: false,
        },
      });

      return { created: record, shouldDefault: makeDefault };
    });

    const objectKey = getObjectKey(userId, created.id, 1, file.originalname);

    // 2. Upload to Supabase
    const { error: uploadError } = await supabase.storage
      .from(env.SUPABASE_RESUME_BUCKET)
      .upload(objectKey, new Blob([new Uint8Array(file.buffer)], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: false, // Prevent accidental overwrite
      });

    if (uploadError) {
      // Rollback database record
      await prisma.resume.delete({ where: { id: created.id } }).catch(() => {});
      throw new ExternalServiceError(`Failed to upload resume: ${uploadError.message}`);
    }

    // 3. Transaction 2: Finalize database
    try {
      const finalResume = await prisma.$transaction(async (tx) => {
        if (shouldDefault) {
          await tx.resume.updateMany({
            where: { userId, isDefault: true, id: { not: created.id } },
            data: { isDefault: false },
          });
          await tx.user.update({
            where: { id: userId },
            data: { defaultResumeId: created.id },
          });
        }

        return tx.resume.update({
          where: { id: created.id },
          data: { filePath: objectKey },
        });
      });
      return finalResume;
    } catch (dbError) {
      // 4. Compensation: Remove orphaned object from Supabase
      const { error: cleanupError } = await supabase.storage
        .from(env.SUPABASE_RESUME_BUCKET)
        .remove([objectKey]);
        
      if (cleanupError) {
        console.error(`[ORPHAN_OBJECT] Cleanup failed for key: ${objectKey}. ResumeId: ${created.id}. Error:`, cleanupError);
      }
      
      // Attempt to clean up the pending record if possible
      await prisma.resume.delete({ where: { id: created.id } }).catch(() => {});
      
      throw new Error('Database finalization failed after successful upload');
    }
  },

  /**
   * Replace an existing resume with a new version.
   */
  async replace(
    userId: string,
    existingId: string,
    file: Express.Multer.File,
    name?: string,
  ): Promise<Resume> {
    validateUploadFile(file);

    const existing = await this.getById(existingId, userId);
    if (existing.archived) {
      throw new ValidationError('Cannot replace an archived resume version');
    }

    const rootId = existing.originalResumeId ?? existing.id;
    const nextVersion = existing.version + 1;
    const newName = name ?? existing.name;

    // 1. Create pending new version
    const created = await prisma.resume.create({
      data: {
        userId,
        name: newName,
        fileName: file.originalname,
        filePath: '', // PENDING
        fileSize: file.size,
        isDefault: existing.isDefault,
        version: nextVersion,
        originalResumeId: rootId,
        archived: false,
      },
    });

    const objectKey = getObjectKey(userId, created.id, nextVersion, file.originalname);

    // 2. Upload to Supabase
    const { error: uploadError } = await supabase.storage
      .from(env.SUPABASE_RESUME_BUCKET)
      .upload(objectKey, new Blob([new Uint8Array(file.buffer)], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      await prisma.resume.delete({ where: { id: created.id } }).catch(() => {});
      throw new ExternalServiceError(`Failed to upload resume: ${uploadError.message}`);
    }

    // 3. Finalize
    try {
      const finalResume = await prisma.$transaction(async (tx) => {
        // Archive the existing one
        await tx.resume.update({
          where: { id: existing.id },
          data: { archived: true, isDefault: false },
        });

        if (existing.isDefault) {
          await tx.resume.updateMany({
            where: { userId, isDefault: true, id: { not: created.id } },
            data: { isDefault: false },
          });
          await tx.user.update({
            where: { id: userId },
            data: { defaultResumeId: created.id },
          });
        }

        return tx.resume.update({
          where: { id: created.id },
          data: { filePath: objectKey },
        });
      });

      return finalResume;
    } catch (dbError) {
      const { error: cleanupError } = await supabase.storage
        .from(env.SUPABASE_RESUME_BUCKET)
        .remove([objectKey]);
        
      if (cleanupError) {
        console.error(`[ORPHAN_OBJECT] Cleanup failed for key: ${objectKey}. ResumeId: ${created.id}. Error:`, cleanupError);
      }
      
      await prisma.resume.delete({ where: { id: created.id } }).catch(() => {});
      throw new Error('Database finalization failed after successful upload');
    }
  },

  /**
   * Get all versions (including archived) of a resume version chain.
   */
  async getVersionHistory(userId: string, resumeId: string): Promise<Resume[]> {
    const resume = await assertOwnership(resumeId, userId);
    const rootId = resume.originalResumeId ?? resume.id;

    return prisma.resume.findMany({
      where: {
        userId,
        OR: [{ id: rootId }, { originalResumeId: rootId }],
        filePath: { not: '' } // Exclude pending
      },
      orderBy: { version: 'asc' },
    });
  },

  /**
   * Atomically set one resume as the default for this user.
   */
  async setDefault(id: string, userId: string): Promise<Resume> {
    const resume = await this.getById(id, userId);
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
   * The Supabase object is NOT deleted so that GeneratedEmails retain their references.
   */
  async archive(id: string, userId: string): Promise<Resume> {
    const resume = await this.getById(id, userId);
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
   * Delete or archive a resume per domain rules:
   * Archives when referenced; otherwise hard-deletes the row and Supabase object.
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

    // Hard delete
    await prisma.$transaction(async (tx) => {
      if (resume.isDefault) {
        await tx.user.update({
          where: { id: userId },
          data: { defaultResumeId: null },
        });
      }
      await tx.resume.delete({ where: { id } });
    });

    if (resume.filePath) {
      const { error } = await supabase.storage
        .from(env.SUPABASE_RESUME_BUCKET)
        .remove([resume.filePath]);
      
      if (error) {
        console.error(`[ORPHAN_OBJECT] Cleanup failed during delete for key: ${resume.filePath}. Error:`, error);
      }
    }

    return { deleted: true, archived: false };
  },

  /**
   * Generate a signed URL for secure download/preview.
   */
  async getSignedUrl(id: string, userId: string, download = false): Promise<string> {
    const resume = await this.getById(id, userId);
    
    // Generate a short-lived signed URL (300 seconds)
    const { data, error } = await supabase.storage
      .from(env.SUPABASE_RESUME_BUCKET)
      .createSignedUrl(resume.filePath, 300, {
        download: download ? resume.fileName : false,
      });

    if (error || !data?.signedUrl) {
      throw new ExternalServiceError('Failed to generate secure URL for resume');
    }

    return data.signedUrl;
  },

  /**
   * Fetch the actual file buffer from Supabase Storage (e.g. for attaching to emails).
   */
  async getFileBuffer(id: string, userId: string): Promise<Buffer> {
    const resume = await this.getById(id, userId);

    const { data, error } = await supabase.storage
      .from(env.SUPABASE_RESUME_BUCKET)
      .download(resume.filePath);

    if (error || !data) {
      throw new ExternalServiceError(`Failed to download resume from storage: ${error?.message}`);
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
};
