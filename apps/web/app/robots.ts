import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants/app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',
        '/pipeline',
        '/leads',
        '/campaigns',
        '/templates',
        '/settings',
        '/send',
        '/build',
        '/generated-emails',
        '/email-logs',
        '/applications',
        '/resumes',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
