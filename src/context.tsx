import { createContext, useContext } from "react";
import type { Row } from "./lib";
export type AppContext = {
  profile: Row;
  settings: Row;
  people: Row[];
  version: number;
  busy: boolean;
  refresh: () => void;
  act: (job: () => Promise<any>, message?: string) => Promise<boolean>;
  navigate: (page: string, tab?: string, request?: string) => void;
  profileTab: string;
  setProfileTab: (tab: string) => void;
  requestTab: string;
  setRequestTab: (tab: string) => void;
};
export const Context = createContext<AppContext>(null!);
export const useApp = () => useContext(Context);
