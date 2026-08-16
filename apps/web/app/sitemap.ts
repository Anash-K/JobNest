import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants/app';

/**
 * The app has no dedicated marketing/landing pages — every route under
 * (app) is gated by AuthGuard and (auth) routes (login/register/etc.) carry
 * no indexable content. The root domain is the only public, indexable entry.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
