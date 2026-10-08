This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
## Manual test checklist

- [ ] Sign up a new user and confirm the home page shows a zero balance.
- [ ] Refresh while logged in, then log out and confirm protected pages remain inaccessible.
- [ ] Log in with a wrong password and confirm the generic error.
- [ ] Test unknown, self, over-balance, and successful send flows.
- [ ] Double-click Send and confirm only one transfer is created.
- [ ] Initialize Paystack checkout, return to the done page, and wait for webhook confirmation.
- [ ] Configure Paystack transfers, withdraw to a valid Nigerian bank account, and confirm success/failure reversal webhooks.
- [ ] Stop the backend and confirm the retry/error state is shown.
- [ ] Confirm no client code uses `parseFloat`, localStorage for secrets, fake deposits, or response logging.
