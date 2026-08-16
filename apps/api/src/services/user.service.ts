import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../utils/errors';

const profileSelect = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  role: true,
  defaultDelaySeconds: true,
  defaultResumeId: true,
  defaultTemplateId: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function assertResumeOwnership(resumeId: string, userId: string): Promise<void> {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId, archived: false },
  });
  if (!resume) {
    throw new ValidationError('Default resume not found or is archived');
  }
}

async function assertTemplateOwnership(templateId: string, userId: string): Promise<void> {
  const template = await prisma.emailTemplate.findFirst({
    where: { id: templateId, userId },
  });
  if (!template) {
    throw new ValidationError('Default template not found');
  }
}

export const userService = {
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });
    if (!user) throw new NotFoundError('User', userId);
    return user;
  },

  async updateProfile(
    userId: string,
    data: {
      name?: string;
      image?: string | null;
      defaultDelaySeconds?: number;
      defaultResumeId?: string | null;
      defaultTemplateId?: string | null;
    },
  ) {
    if (data.defaultDelaySeconds !== undefined) {
      if (data.defaultDelaySeconds < 5 || data.defaultDelaySeconds > 60) {
        throw new ValidationError('Default delay must be between 5 and 60 seconds');
      }
    }

    if (data.defaultResumeId) {
      await assertResumeOwnership(data.defaultResumeId, userId);
    }

    if (data.defaultTemplateId) {
      await assertTemplateOwnership(data.defaultTemplateId, userId);
    }

    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.image !== undefined ? { image: data.image } : {}),
        ...(data.defaultDelaySeconds !== undefined
          ? { defaultDelaySeconds: data.defaultDelaySeconds }
          : {}),
        ...(data.defaultResumeId !== undefined ? { defaultResumeId: data.defaultResumeId } : {}),
        ...(data.defaultTemplateId !== undefined
          ? { defaultTemplateId: data.defaultTemplateId }
          : {}),
      },
      select: profileSelect,
    });
  },

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    return sessions.map((session) => ({
      ...session,
      isCurrent: session.id === currentSessionId,
    }));
  },

  async revokeSession(userId: string, sessionId: string, currentSessionId: string) {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundError('Session', sessionId);

    await prisma.session.delete({ where: { id: sessionId } });

    return {
      revoked: true,
      wasCurrent: sessionId === currentSessionId,
    };
  },

  async revokeOtherSessions(userId: string, currentSessionId: string) {
    const result = await prisma.session.deleteMany({
      where: {
        userId,
        id: { not: currentSessionId },
        expiresAt: { gt: new Date() },
      },
    });

    return { revokedCount: result.count };
  },
};
