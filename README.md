# Swiftbucks

Swiftbucks is a Nigerian naira wallet app for managing everyday payments in one place. Explore the app at **swiftbucks.vercel.app**.

## What the app does

- **Wallet and activity:** View your wallet balance and transaction history.
- **Add money:** Fund your wallet through Paystack checkout and follow payment confirmation.
- **Send money:** Transfer funds to another Swiftbucks user by username.
- **Withdraw:** Request a withdrawal to a Nigerian bank account and track its status.
- **Airtime:** Buy airtime for MTN, Airtel, Glo, and 9mobile numbers.
- **Mobile data:** Browse available bundles and purchase data for supported networks.
- **Account access:** Create an account, sign in, and manage a protected wallet profile.

## Integrated services

- **Paystack** handles wallet funding, payment verification, bank transfers, and payment or transfer status updates.
- **VTpass** supplies airtime and data services, available network plans, purchase status updates, and provider balance checks.
- **PostgreSQL** stores user accounts, wallet ledgers, transactions, withdrawals, and bill purchases through the Prisma data layer.
- **Vercel** hosts the Next.js web app.

## Project structure

- `frontend/` — Next.js and React web application.
- `Backend/` — Express API, wallet and payments logic, provider integrations, and database schema and migrations.

## Technology

The frontend uses Next.js, React, TypeScript, Tailwind CSS, and TanStack Query. The API uses Express and TypeScript, with PostgreSQL and Prisma for persistence.

## Run locally

Install dependencies in each app directory, configure the backend environment, then start the API and web app in separate terminals:

```bash
cd Backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

The backend needs a PostgreSQL connection and credentials for the payment and bill providers. Configure secrets in local environment files; do not commit credentials. The frontend uses `API_ORIGIN` to locate the API. Set these values in your deployment environment as well.

## Useful commands

Run these from the relevant app directory:

- Frontend: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`
- Backend: `npm run dev`, `npm start`, `npm test`
