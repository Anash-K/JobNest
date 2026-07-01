-- CreateTable
CREATE TABLE "GoogleOAuthConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleOAuthConfig_pkey" PRIMARY KEY ("id")
);
