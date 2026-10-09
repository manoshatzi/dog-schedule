import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type DailyNeed = {
  id: string;
  title: string;
  time: string;
  details: string;
  required: boolean;
};

export type DailyNeedInput = Omit<DailyNeed, "id"> & { id?: string };

type DailyNeedsContextValue = {
  needs: DailyNeed[];
  saveNeed: (input: DailyNeedInput) => void;
};

const DailyNeedsContext = createContext<DailyNeedsContextValue | null>(null);

export function DailyNeedsProvider({ children }: { children: ReactNode }) {
  const [needs, setNeeds] = useState<DailyNeed[]>([]);
  const nextId = useRef(0);

  function saveNeed(input: DailyNeedInput) {
    const need: DailyNeed = {
      ...input,
      id: input.id ?? `need-${Date.now()}-${nextId.current++}`,
    };

    setNeeds((current) => {
      const updated = current.some((item) => item.id === need.id)
        ? current.map((item) => (item.id === need.id ? need : item))
        : [...current, need];
      return updated.sort((first, second) =>
        first.time.localeCompare(second.time),
      );
    });
  }

  return (
    <DailyNeedsContext.Provider value={{ needs, saveNeed }}>
      {children}
    </DailyNeedsContext.Provider>
  );
}

export function useDailyNeeds() {
  const context = useContext(DailyNeedsContext);
  if (!context) {
    throw new Error("useDailyNeeds must be used within DailyNeedsProvider");
  }
  return context;
}
