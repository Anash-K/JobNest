declare namespace Express {
  interface Request {
    user?: {
      id: string;
      email: string;
      name: string;
      role: 'USER' | 'ADMIN';
      emailVerified: boolean;
      image?: string | null;
    };
    session?: {
      id: string;
      expiresAt: Date;
      token: string;
      createdAt: Date;
      updatedAt: Date;
      userId: string;
    };
  }
}
