import { prisma } from '../lib/prisma';
import { NotFoundError } from './errors';

export async function assertCampaignOwnership(campaignId: string, userId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { userId: true },
  });
  if (!campaign || campaign.userId !== userId) {
    throw new NotFoundError('Campaign', campaignId);
  }
}
