import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { FESTIVALS } from './festivals';

export type ShopPlatform = 'taobao' | 'jd';

type SettingsState = {
  remindDays: number;
  pushEnabled: boolean;
  blessingCount: number;
  platform: ShopPlatform;
  cardSignature: boolean;
  followedFestivals: Record<string, boolean>;
  followedCount: number;
  setRemindDays: (value: number) => void;
  setPushEnabled: (value: boolean) => void;
  setBlessingCount: (value: number) => void;
  setPlatform: (value: ShopPlatform) => void;
  setCardSignature: (value: boolean) => void;
  toggleFestival: (id: string, value: boolean) => void;
};

const SettingsContext = createContext<SettingsState | null>(null);

const ALL_FOLLOWED = Object.fromEntries(FESTIVALS.map((f) => [f.id, true]));

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [remindDays, setRemindDays] = useState(3);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [blessingCount, setBlessingCount] = useState(3);
  const [platform, setPlatform] = useState<ShopPlatform>('taobao');
  const [cardSignature, setCardSignature] = useState(false);
  const [followedFestivals, setFollowedFestivals] =
    useState<Record<string, boolean>>(ALL_FOLLOWED);

  const toggleFestival = useCallback((id: string, value: boolean) => {
    setFollowedFestivals((prev) => ({ ...prev, [id]: value }));
  }, []);

  const followedCount = useMemo(
    () => FESTIVALS.filter((f) => followedFestivals[f.id]).length,
    [followedFestivals],
  );

  const value = useMemo<SettingsState>(
    () => ({
      remindDays,
      pushEnabled,
      blessingCount,
      platform,
      cardSignature,
      followedFestivals,
      followedCount,
      setRemindDays,
      setPushEnabled,
      setBlessingCount,
      setPlatform,
      setCardSignature,
      toggleFestival,
    }),
    [
      remindDays,
      pushEnabled,
      blessingCount,
      platform,
      cardSignature,
      followedFestivals,
      followedCount,
      toggleFestival,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings 必须在 SettingsProvider 内使用');
  return ctx;
}
