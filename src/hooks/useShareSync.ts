import { useEffect, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/authStore';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useGoalsStore } from '../store/goalsStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { useShareStore } from '../store/shareStore';
import { useDisplayName } from './useDisplayName';
import { isAnonymousUser } from './useFirestoreSync';
import { pushShareUpdate } from '../utils/shareLink';

/** Live prices tick every second; the shared copy is refreshed at most this often. */
const MIN_GAP_MS = 60_000;
const FIRST_DELAY_MS = 3_000;

/**
 * While a view-only link is active, keeps the shared copy in step with the owner's data
 * (edits, new prices) so the person opening the link sees current figures. Does nothing when
 * not sharing, for guests (their data never leaves the device), or when nothing changed.
 */
export function useShareSync() {
  const user = useAuthStore((s) => s.user);
  const uid = user?.uid;
  const guest = !user || isAnonymousUser(user);
  const token = useShareStore((s) => s.token);
  const setToken = useShareStore((s) => s.setToken);
  const name = useDisplayName('');

  // Which link (if any) this account has.
  useEffect(() => {
    if (!uid || guest) {
      setToken(null);
      return;
    }
    return onSnapshot(
      doc(db, 'users', uid, 'shareLink', 'main'),
      (snap) => setToken(snap.exists() ? ((snap.data().token as string | undefined) ?? null) : null),
      () => setToken(null)
    );
  }, [uid, guest, setToken]);

  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const goals = useGoalsStore((s) => s.goals);
  const profiles = useHouseholdProfilesStore((s) => s.profiles);
  const prices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const gold = useLivePricesStore((s) => s.goldPricePerGram);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentAt = useRef(0);
  const lastJson = useRef<string | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;

  // A different link starts from scratch.
  useEffect(() => {
    lastJson.current = null;
    lastSentAt.current = Date.now(); // the link was just created with fresh figures
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [token]);

  // Something changed: schedule one (throttled) refresh of the shared copy.
  useEffect(() => {
    if (!token || timer.current) return;
    const wait = Math.max(FIRST_DELAY_MS, MIN_GAP_MS - (Date.now() - lastSentAt.current));
    timer.current = setTimeout(() => {
      timer.current = null;
      pushShareUpdate(token, nameRef.current, lastJson.current)
        .then((sent) => {
          lastSentAt.current = Date.now();
          if (sent) lastJson.current = sent;
        })
        .catch(() => {
          /* offline or link removed: try again on the next change */
        });
    }, wait);
  }, [token, assets, liabilities, goals, profiles, prices, sipValues, gold]);
}
