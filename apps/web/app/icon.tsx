import { ImageResponse } from 'next/og';
import { APP_LOGO_LETTERS } from '@/lib/constants/app';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 6,
          background: '#0da2e7',
          color: '#ffffff',
          fontSize: 16,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        {APP_LOGO_LETTERS}
      </div>
    ),
    { ...size },
  );
}
