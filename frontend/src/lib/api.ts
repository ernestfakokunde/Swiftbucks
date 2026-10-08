import { queryClient } from "@/lib/queryClient";

export type User = {
  id: number;
  email: string;
  username: string;
  name?: string | null;
};

export type Balance = { balanceKobo: string };
export type MoneyResult = { transactionId: number; duplicate: boolean };
export type UserLookup = { username: string; displayName: string };
export type DepositInitialization = {
  authorizationUrl: string;
  reference: string;
};
export type DepositStatus = "PENDING" | "SUCCESS" | "MISMATCH";

export type ActivityItem = {
  id: number;
  title: string;
  type: "DEPOSIT" | "WITHDRAWAL" | "TRANSFER";
  status: string;
  amountKobo: string;
  createdAt: string;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function handleUnauthorized(path: string) {
  if (typeof window === "undefined") return;
  const currentPath = window.location.pathname;
  const isPublicAuthPage = currentPath === "/login" || currentPath === "/signup";
  const isMeCheck = path === "/auth/me";
  if (isPublicAuthPage && isMeCheck) return;
  if (isPublicAuthPage) return;

  queryClient.clear();
  const next = encodeURIComponent(
    safeNextPath(`${window.location.pathname}${window.location.search}`),
  );
  // The API layer has no router instance; force a full navigation after clearing auth state.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${next}`);
}

export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "Can't reach Swiftbuck. Check your connection and try again.",
    );
  }

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized(path);
    throw new ApiError(
      response.status,
      data?.error ?? "Something went wrong. Try again.",
    );
  }
  return data as T;
}

export function getMe() {
  return request<User>("/api/auth/me");
}

export function login(email: string, password: string) {
  return request<User>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return request<void>("/api/auth/logout", { method: "POST" });
}

export function createUser(
  email: string,
  username: string,
  password: string,
) {
  return request<User>("/api/users", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  });
}

export function getBalance() {
  return request<Balance>("/api/wallet/balance");
}

export function lookupUser(username: string) {
  return request<UserLookup>(
    `/api/users/lookup?username=${encodeURIComponent(username)}`,
  );
}

export function transfer(
  receiverUsername: string,
  amountKobo: number,
  reference: string,
) {
  return request<MoneyResult>("/api/wallet/transfer", {
    method: "POST",
    body: JSON.stringify({ receiverUsername, amountKobo, reference }),
  });
}

export function withdraw(amountKobo: number, reference: string) {
  return request<MoneyResult>("/api/wallet/withdraw", {
    method: "POST",
    body: JSON.stringify({ amountKobo, reference }),
  });
}

export function initializeDeposit(amountKobo: number) {
  return request<DepositInitialization>("/api/wallet/deposit/initialize", {
    method: "POST",
    body: JSON.stringify({ amountKobo }),
  });
}

export function getDepositStatus(reference: string) {
  return request<{ status: DepositStatus }>(
    `/api/wallet/deposit/status?reference=${encodeURIComponent(reference)}`,
  );
}

export function getTransactions() {
  return request<ActivityItem[]>("/api/wallet/transactions");
}
