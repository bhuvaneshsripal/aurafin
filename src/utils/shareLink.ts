import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useGoalsStore } from '../store/goalsStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { resolveAssetValues } from './assetValues';

/**
 * View-only share link.
 *
 * The owner's app writes a small, read-only COPY of the headline figures to `shares/{token}`.
 * The token is a long random string, so only someone holding the link can open the copy
 * (Firestore rules allow a single-document read but never a listing). The viewer page never
 * signs in and has no way to write: the rules only let the owner create / update / delete.
 * Deleting the document (Stop sharing) kills the link immediately.
 *
 * Only what the shared page shows is copied: names, types, values, P&L, loans, goals. Notes,
 * account numbers, transactions, PINs and personal details are never included.
 */

export interface SharedAsset {
  id: string;
  name: string;
  cls: string;
  value: number;
  invested?: number;
  pnl?: number;
  pct?: number;
  qty?: number;
  profileId?: string;
}

export interface SharedLiability {
  id: string;
  name: string;
  cls?: string;
  outstanding: number;
  emi?: number;
  lender?: string;
  profileId?: string;
}

export interface SharedGoal {
  id: string;
  name: string;
  target: number;
  current: number;
  targetDate?: string;
  /** Progress follows net worth instead of `current`. */
  linked?: boolean;
  profileId?: string;
}

export interface SharedProfile {
  id: string;
  name: string;
  colour: string;
}

export interface SharePayload {
  v: 1;
  currency: string;
  assets: SharedAsset[];
  liabilities: SharedLiability[];
  goals: SharedGoal[];
  profiles: SharedProfile[];
}

export interface ShareDoc {
  ownerUid: string;
  ownerName: string;
  createdAt: number;
  updatedAt: number;
  /** JSON of SharePayload (one string keeps the document small and schema-free). */
  payload: string;
}

/** Firestore documents are capped at 1 MiB; stay well under it. */
const MAX_PAYLOAD_CHARS = 900_000;

const round = (n: number | undefined, digits = 2): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10 ** digits) / 10 ** digits : undefined;

export function firstName(full: string | null | undefined): string {
  const t = (full ?? '').trim();
  if (!t || t.includes('@')) return '';
  return t.split(/\s+/)[0];
}

/** Long, unguessable link id (192 bits, URL-safe). */
export function generateShareToken(): string {
  const bytes = new Uint8Array(24);
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    // Never fall back to Math.random: a guessable link would expose someone's finances.
    throw new Error('This browser cannot create a secure link.');
  }
  c.getRandomValues(bytes);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

/** Builds the read-only copy from what is on screen right now (live prices included). */
export function buildSharePayload(): SharePayload {
  const assets = useAssetsStore.getState().assets;
  const liabilities = useLiabilitiesStore.getState().liabilities;
  const goals = useGoalsStore.getState().goals;
  const profiles = useHouseholdProfilesStore.getState().profiles;
  const live = useLivePricesStore.getState();

  const sharedAssets: SharedAsset[] = assets.map((a) => {
    const r = resolveAssetValues(a, live.prices, live.sipValues, live.goldPricePerGram);
    return {
      id: a.id,
      name: a.name,
      cls: a.assetClass,
      value: round(r.value) ?? 0,
      invested: round(r.invested),
      pnl: round(r.pnl),
      pct: round(r.pnlPercent),
      qty: round(a.quantity, 4),
      profileId: a.profileId,
    };
  });

  // Most common currency among the assets (the app sums values as one currency).
  const counts = new Map<string, number>();
  assets.forEach((a) => counts.set(a.currency, (counts.get(a.currency) ?? 0) + 1));
  const currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'INR';

  return {
    v: 1,
    currency,
    assets: sharedAssets,
    liabilities: liabilities.map((l) => ({
      id: l.id,
      name: l.name,
      cls: l.liabilityClass,
      outstanding: round(l.outstanding) ?? 0,
      emi: round(l.emi),
      lender: l.lender,
      profileId: l.profileId,
    })),
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      target: round(g.targetAmount) ?? 0,
      current: round(g.currentAmount) ?? 0,
      targetDate: g.targetDate,
      linked: g.linkedToNetWorth || undefined,
      profileId: g.profileId,
    })),
    profiles: profiles.map((p) => ({ id: p.id, name: p.name, colour: p.colour })),
  };
}

export function serializePayload(p: SharePayload): string {
  // JSON.stringify drops `undefined` fields, keeping the copy compact.
  const json = JSON.stringify(p);
  if (json.length > MAX_PAYLOAD_CHARS) throw new Error('Your portfolio is too large to share as a link.');
  return json;
}

/** Creates a brand-new link (replacing any earlier one, which stops working). */
export async function createShareLink(uid: string, ownerName: string, previousToken?: string | null): Promise<string> {
  const token = generateShareToken();
  const now = Date.now();
  const body: ShareDoc = {
    ownerUid: uid,
    ownerName: firstName(ownerName),
    createdAt: now,
    updatedAt: now,
    payload: serializePayload(buildSharePayload()),
  };
  await setDoc(doc(db, 'shares', token), body);
  await setDoc(doc(db, 'users', uid, 'shareLink', 'main'), { token, createdAt: now });
  if (previousToken && previousToken !== token) {
    try {
      await deleteDoc(doc(db, 'shares', previousToken));
    } catch {
      /* the old copy stays unreachable once the owner's pointer moved on */
    }
  }
  return token;
}

/** Stops sharing: the link shows "no longer active" right away. */
export async function revokeShareLink(uid: string, token: string | null): Promise<void> {
  if (token) {
    try {
      await deleteDoc(doc(db, 'shares', token));
    } catch {
      /* already gone */
    }
  }
  await deleteDoc(doc(db, 'users', uid, 'shareLink', 'main'));
}

/** Pushes fresh figures into the existing link. Returns the JSON sent, or null when nothing changed. */
export async function pushShareUpdate(token: string, ownerName: string, lastJson: string | null): Promise<string | null> {
  const json = serializePayload(buildSharePayload());
  if (json === lastJson) return null;
  await updateDoc(doc(db, 'shares', token), {
    payload: json,
    updatedAt: Date.now(),
    ownerName: firstName(ownerName),
  });
  return json;
}

/** Best-effort cleanup used when the account's data is wiped. */
export async function revokeShareLinkForUser(uid: string): Promise<void> {
  try {
    const link = await getDoc(doc(db, 'users', uid, 'shareLink', 'main'));
    const token = link.exists() ? (link.data().token as string | undefined) : undefined;
    await revokeShareLink(uid, token ?? null);
  } catch {
    /* nothing shared, or offline: the next visit can stop it from Settings */
  }
}
