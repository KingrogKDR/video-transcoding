"use server";

import { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL = "http://localhost:8000";

export async function requireAuth() {
  return await getCurrentUser(); // no redirect here
}

function clearAuthCookies(c: ReadonlyRequestCookies) {
  c.delete("accessToken");
  c.delete("refreshToken");
}

export async function signOut() {
  const c = await cookies();

  const accessToken = c.get("accessToken")?.value || undefined;
  const refreshToken = c.get("refreshToken")?.value || undefined;

  try {
    if (accessToken && refreshToken) {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch {
    // ignore logout failure
  }

  // Always clear cookies
  clearAuthCookies(c);
  redirect("/signin");
}

export async function getCurrentUser() {
  const c = await cookies();

  let accessToken = c.get("accessToken")?.value || undefined;

  // 🔒 Prevent infinite refresh attempts
  let triedRefresh = false;

  // Step 1: Try refresh if no access token
  if (!accessToken) {
    accessToken = await refreshAccessToken();
    triedRefresh = true;

    if (!accessToken) return null;
  }

  // Step 2: Try fetching user
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (res.ok) {
    const data = await res.json();
    return data.user;
  }

  // Step 3: Try refresh ONLY ONCE
  if (res.status === 401 && !triedRefresh) {
    const newToken = await refreshAccessToken();

    if (!newToken) return null;

    const retry = await fetch(`${API_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${newToken}`,
      },
      cache: "no-store",
    });

    if (retry.ok) {
      const data = await retry.json();
      return data.user;
    }
  }

  return null;
}

async function refreshAccessToken(): Promise<string | null> {
  const c = await cookies();
  if (c.get("refreshFailed")?.value === "true") {
    return null;
  }

  const refreshToken = c.get("refreshToken")?.value;

  if (!refreshToken) return null;

  const res = await fetch(`http://localhost:3000/api/auth/refresh`, {
    method: "POST",
    headers: {
      cookie: c.toString(),
    },
    cache: "no-store",
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    return null;
  }

  const tokens = await res.json();

  return tokens.accessToken;
}
