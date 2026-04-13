import { db, usersTable } from "@video-transcoding/db";
import { eq } from "drizzle-orm";
import { Request, Response, Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import {
  generateTokenPair,
  isRefreshTokenValid,
  revokeAllUserTokens,
  revokeRefreshToken,
  verifyRefreshToken,
} from "../services/token.service";
import { hashPassword, verifyPassword } from "../utils/password";
import {
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
} from "../utils/validation";

const router: Router = Router();

// POST /auth/register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
    }

    const { email, password } = result.data;

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await hashPassword(password);

    const [newUser] = await db
      .insert(usersTable)
      .values({
        email: email.toLowerCase(),
        passwordHash,
      })
      .returning({
        userId: usersTable.userId,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
      });

    const tokens = await generateTokenPair(newUser.userId, newUser.email);

    res.status(201).json({
      user: {
        userId: newUser.userId,
        email: newUser.email,
        createdAt: newUser.createdAt,
      },
      ...tokens,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
    }

    const { email, password } = result.data;

    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = users[0];
    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const tokens = await generateTokenPair(user.userId, user.email);

    res.json({
      user: {
        userId: user.userId,
        email: user.email,
        createdAt: user.createdAt,
      },
      ...tokens,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /auth/refresh
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const result = refreshTokenSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
    }

    const { refreshToken } = result.data;

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const isValid = await isRefreshTokenValid(payload.tokenId, refreshToken);
    if (!isValid) {
      return res
        .status(401)
        .json({ error: "Refresh token expired or revoked" });
    }

    // Revoke the old refresh token (token rotation)
    await revokeRefreshToken(payload.tokenId);

    // Get user info for new tokens
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.userId, payload.userId))
      .limit(1);

    if (users.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = users[0];
    const tokens = await generateTokenPair(user.userId, user.email);

    res.json(tokens);
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

// POST /auth/logout (protected)
router.post("/logout", authenticate, async (req: Request, res: Response) => {
  try {
    const result = logoutSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
    }

    const { refreshToken } = result.data;

    if (refreshToken) {
      const payload = verifyRefreshToken(refreshToken);
      if (payload) {
        await revokeRefreshToken(payload.tokenId);
      }
    } else {
      // If no refresh token provided, revoke all tokens for the user
      await revokeAllUserTokens(req.user!.userId);
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

// GET /auth/me (protected)
router.get("/me", authenticate, async (req: Request, res: Response) => {
  try {
    const users = await db
      .select({
        userId: usersTable.userId,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.userId, req.user!.userId))
      .limit(1);

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: users[0] });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user info" });
  }
});

export default router;
