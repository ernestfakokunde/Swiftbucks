 "use client";
import { createContext, useContext } from "react";

const UserContext = createContext<{ userId: number }>({ userId: 1 });

export const useUser = () => useContext(UserContext);

export function UserProvider({ children }: { children: React.ReactNode }) {
  // WIRE LATER: replace the hard-coded 1 with the logged-in user
  return <UserContext.Provider value={{ userId: 1 }}>{children}</UserContext.Provider>;
}