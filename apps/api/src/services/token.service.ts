import { db, refreshTokensTable } from "@video-transcoding/db";
import crypto from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { AUTH_CONFIG } from "../config/auth";

const JWT_SECRET =
  process.env.JWT_SECRET || "dev-jwt-secret-change-in-production";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-in-production";

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export interface RefreshTokenPayload {
  tokenId: string;
  userId: string;
}

export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: AUTH_CONFIG.ACCESS_TOKEN_EXPIRY,
  });
}

export function generateRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: AUTH_CONFIG.REFRESH_TOKEN_EXPIRY,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function storeRefreshToken(
  userId: string,
  tokenId: string,
  token: string,
): Promise<void> {
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + AUTH_CONFIG.REFRESH_TOKEN_EXPIRY_MS);

  await db.insert(refreshTokensTable).values({
    tokenId,
    userId,
    tokenHash,
    expiresAt,
  });
}

export async function revokeRefreshToken(tokenId: string): Promise<void> {
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokensTable.tokenId, tokenId));
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokensTable.userId, userId),
        isNull(refreshTokensTable.revokedAt),
      ),
    );
}

export async function isRefreshTokenValid(
  tokenId: string,
  token: string,
): Promise<boolean> {
  const tokenHash = hashToken(token);

  const result = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.tokenId, tokenId),
        eq(refreshTokensTable.tokenHash, tokenHash),
        isNull(refreshTokensTable.revokedAt),
      ),
    )
    .limit(1);

  if (result.length === 0) {
    return false;
  }

  const storedToken = result[0];
  return storedToken.expiresAt > new Date();
}

export async function generateTokenPair(
  userId: string,
  email: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenId = crypto.randomUUID();

  const accessToken = generateAccessToken({ userId, email });
  const refreshToken = generateRefreshToken({ tokenId, userId });

  await storeRefreshToken(userId, tokenId, refreshToken);

  return { accessToken, refreshToken };
}
