 const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ---------- Types: the shape of what the backend sends back ----------
export type Balance = { balanceKobo: string };
export type MoneyResult = { transactionId: number; duplicate: boolean };
export type CreatedUser = {
  user: { id: number; email: string; username: string };
  wallet: { id: number };
};
export type UserLookup = { username: string; displayName: string };

// ---------- Errors ----------
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------- The one function that talks to the backend ----------
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch {
    throw new ApiError(0, "Can't reach Swiftbuck. Check your connection and try again.");
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "Something went wrong. Try again.");
  }
  return data as T;
}

// ---------- One function per endpoint ----------
export function getBalance(userId: number) {
  return request<Balance>(`/api/wallets/${userId}/balance`);
}

export function createUser(email: string, username: string) {
  return request<CreatedUser>(`/api/users`, {
    method: "POST",
    body: JSON.stringify({ email, username }),
  });
}

export function lookupUser(username: string) {
  return request<UserLookup>(`/api/users/lookup?username=${encodeURIComponent(username)}`);
}

export function deposit(userId: number, amountKobo: number, reference: string) {
  return request<MoneyResult>(`/api/wallets/${userId}/deposit`, {
    method: "POST",
    body: JSON.stringify({ amountKobo, reference }),
  });
}

export function withdraw(userId: number, amountKobo: number, reference: string) {
  return request<MoneyResult>(`/api/wallets/${userId}/withdraw`, {
    method: "POST",
    body: JSON.stringify({ amountKobo, reference }),
  });
}

export function transfer(
  userId: number,
  receiverUsername: string,
  amountKobo: number,
  reference: string
) {
  return request<MoneyResult>(`/api/wallets/${userId}/transfer`, {
    method: "POST",
    body: JSON.stringify({ receiverUsername, amountKobo, reference }),
  });
}