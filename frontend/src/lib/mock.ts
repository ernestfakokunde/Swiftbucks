export type ActivityItem = {
  id: number;
  title: string;
  date: string;
  amountKobo: string;
  status?: "processing";
};

const balance = { balanceKobo: "4820000" };

const activity: ActivityItem[] = [
  { id: 1, title: "Sent to Bola Ade", date: "Today, 10:42", amountKobo: "-200000" },
  { id: 2, title: "Added money", date: "Today, 09:15", amountKobo: "1500000" },
  { id: 3, title: "Received from Chidi Eze", date: "Yesterday", amountKobo: "500000" },
  {
    id: 4,
    title: "Withdrawal to GTBank",
    date: "Yesterday",
    amountKobo: "-1000000",
    status: "processing",
  },
  { id: 5, title: "Added money", date: "Mon", amountKobo: "3000000" },
  { id: 6, title: "Sent to Tolu Bakare", date: "Sun", amountKobo: "-350000" },
];

function wait() {
  return new Promise((resolve) => setTimeout(resolve, 350));
}

export async function getMockBalance() {
  // WIRE: GET /api/wallets/:userId/balance | returns { balanceKobo: string } | handle loading, retry, and API errors
  await wait();
  return balance;
}

export async function getMockActivity() {
  // WIRE: activity history endpoint | returns ActivityItem[] | handle loading, retry, and API errors
  await wait();
  return activity;
}

const users: Record<string, string> = {
  bola: "Bola Ade",
  chidi: "Chidi Eze",
  tolu: "Tolu Bakare",
};

export async function resolveMockUsername(username: string) {
  // WIRE: username lookup endpoint | returns { displayName: string } | handle not-found and network errors
  await wait();
  const displayName = users[username.toLowerCase()];
  if (!displayName) {
    throw new Error("Receiver not found");
  }
  return { displayName };
}

export async function mockTransfer(input: {
  receiverUsername: string;
  amountKobo: number;
  reference: string;
}) {
  // WIRE: POST /api/wallets/:userId/transfer | returns { transactionId: number, duplicate: boolean } | handle known API errors and duplicate success
  await wait();
  if (input.receiverUsername.toLowerCase() === "self") {
    throw new Error("Sender and receiver cannot be the same");
  }
  if (BigInt(input.amountKobo) > BigInt(balance.balanceKobo)) {
    throw new Error("Insufficient funds");
  }
  return { transactionId: 1001, duplicate: false };
}

export async function resolveMockAccount(accountNumber: string, bank: string) {
  // WIRE: bank account-name lookup | returns { accountName: string } | handle invalid account and network errors
  await wait();
  if (!/^\d{10}$/.test(accountNumber)) {
    throw new Error("Invalid input");
  }
  return { accountName: "Ada Obi", bank };
}

export async function mockDeposit(input: { amountKobo: number; reference: string }) {
  // WIRE: POST /api/wallets/:userId/deposit | returns { transactionId: number, duplicate: boolean } | handle API errors and duplicate success
  await wait();
  if (input.amountKobo <= 0) throw new Error("Invalid input");
  return { transactionId: 1002, duplicate: false };
}

export async function mockWithdraw(input: { amountKobo: number; reference: string }) {
  // WIRE: POST /api/wallets/:userId/withdraw | returns { transactionId: number, duplicate: boolean } | handle known API errors and duplicate success
  await wait();
  if (BigInt(input.amountKobo) > BigInt(balance.balanceKobo)) {
    throw new Error("Insufficient funds");
  }
  return { transactionId: 1003, duplicate: false };
}
