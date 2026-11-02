import { create } from 'zustand';

/** One choice in a dropdown: `value` is what gets saved, `label` what's shown. */
export interface DetailOption<T extends string = string> {
  value: T;
  label: string;
}

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly DetailOption[];

export const MARITAL_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
] as const satisfies readonly DetailOption[];

export const INCOME_OPTIONS = [
  { value: 'below-1l', label: 'Below 1 Lac' },
  { value: '1l-5l', label: '1 – 5 Lac' },
  { value: '5l-10l', label: '5 – 10 Lac' },
  { value: '10l-25l', label: '10 – 25 Lac' },
  { value: '25l-1cr', label: '25 Lac – 1 Cr' },
  { value: 'above-1cr', label: 'Above 1 Cr' },
] as const satisfies readonly DetailOption[];

export const OCCUPATION_OPTIONS = [
  { value: 'private', label: 'Private Sector' },
  { value: 'public', label: 'Public Sector' },
  { value: 'government', label: 'Government Service' },
  { value: 'business', label: 'Business' },
  { value: 'professional', label: 'Professional' },
  { value: 'self-employed', label: 'Self Employed' },
  { value: 'agriculturist', label: 'Agriculturist' },
  { value: 'retired', label: 'Retired' },
  { value: 'homemaker', label: 'Homemaker' },
  { value: 'student', label: 'Student' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly DetailOption[];

export type Gender = (typeof GENDER_OPTIONS)[number]['value'];
export type MaritalStatus = (typeof MARITAL_OPTIONS)[number]['value'];
export type IncomeRange = (typeof INCOME_OPTIONS)[number]['value'];
export type Occupation = (typeof OCCUPATION_OPTIONS)[number]['value'];

/** The person's own details, shown in Settings > Basic details. Every field is
 *  optional; a missing field just shows as "Not set". */
export interface BasicDetails {
  fullName?: string;
  /** "YYYY-MM-DD". */
  dob?: string;
  /** 10 digits, no country code. */
  mobile?: string;
  /** Only used when the sign-in has no email of its own (a demo account). */
  email?: string;
  maritalStatus?: MaritalStatus;
  gender?: Gender;
  incomeRange?: IncomeRange;
  occupation?: Occupation;
  fatherName?: string;
  address?: string;
}

export const BASIC_DETAIL_KEYS = [
  'fullName',
  'dob',
  'mobile',
  'email',
  'maritalStatus',
  'gender',
  'incomeRange',
  'occupation',
  'fatherName',
  'address',
] as const satisfies readonly (keyof BasicDetails)[];

interface BasicDetailsState {
  details: BasicDetails;
  /** False until the first read for the signed-in account has finished, so the
   *  screen doesn't flash "Not set" before the real values arrive. */
  loaded: boolean;
  setDetails: (details: BasicDetails, loaded?: boolean) => void;
}

export const useBasicDetailsStore = create<BasicDetailsState>((set) => ({
  details: {},
  loaded: false,
  setDetails: (details, loaded = true) => set({ details, loaded }),
}));

/** Keeps only the known fields with real values, so a stray or empty field in
 *  stored data can never leak into the UI. */
export function cleanBasicDetails(raw: unknown): BasicDetails {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object') {
    for (const key of BASIC_DETAIL_KEYS) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.trim() !== '') out[key] = v;
    }
  }
  return out as BasicDetails;
}
