import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import {
  useBasicDetailsStore,
  GENDER_OPTIONS,
  MARITAL_OPTIONS,
  INCOME_OPTIONS,
  OCCUPATION_OPTIONS,
  type BasicDetails,
  type DetailOption,
} from '../store/basicDetailsStore';
import { saveBasicDetails } from '../hooks/useFirestoreSync';
import { isoToDisplay, toIsoDate } from '../utils/date';
import { DateInput, Input, Textarea, inputClasses } from './ui';
import CustomSelect from './CustomSelect';

type Parsed = { value: string } | { error: string };

interface FieldConfig {
  key: keyof BasicDetails;
  label: string;
  input: 'text' | 'tel' | 'email' | 'date' | 'select' | 'textarea';
  options?: readonly DetailOption[];
  maxLength?: number;
  placeholder?: string;
  /** Small note shown under the value or the editor. */
  hint?: string;
  /** How a saved value is shown. Defaults to the value itself (or its option label). */
  format?: (value: string) => string;
  /** Checks and tidies what was typed. Defaults to trimming. */
  parse?: (draft: string) => Parsed;
  /** Shown instead of an editable value, with no pencil (e.g. the sign-in email). */
  fixedValue?: string;
}

const MOBILE = /^[6-9]\d{9}$/;

function parseMobile(draft: string): Parsed {
  let digits = draft.replace(/\D/g, '');
  if (digits === '') return { value: '' };
  // Allow a pasted +91 / 0 prefix.
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return MOBILE.test(digits) ? { value: digits } : { error: 'Enter a valid 10-digit mobile number.' };
}

function parseEmail(draft: string): Parsed {
  const v = draft.trim();
  if (v === '') return { value: '' };
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { value: v } : { error: 'Enter a valid email address.' };
}

const formatMobile = (v: string) => (v.length === 10 ? `+91 ${v.slice(0, 5)} ${v.slice(5)}` : v);

function labelFor(options: readonly DetailOption[] | undefined, value: string) {
  return options?.find((o) => o.value === value)?.label ?? value;
}

function Row({
  config,
  value,
  loaded,
  onSave,
  activeKey,
  onActivate,
}: {
  config: FieldConfig;
  value: string;
  loaded: boolean;
  onSave: (value: string) => Promise<void>;
  /** Which row is currently being edited (only one at a time). */
  activeKey: string | null;
  onActivate: (key: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');

  const { label, input, options, fixedValue } = config;
  const shown = fixedValue ?? value;
  const display = shown ? (config.format ? config.format(shown) : labelFor(options, shown)) : '';
  const saving = status === 'saving';
  // A date field reports '' both for "empty" and "not a real date yet".
  const canSave = !saving && !(input === 'date' && draft === '');

  const start = () => {
    setDraft(value);
    setError('');
    setStatus('idle');
    setEditing(true);
    onActivate(config.key);
  };
  const cancel = () => {
    setEditing(false);
    setError('');
    setStatus('idle');
  };
  const save = async (override?: string) => {
    if (!canSave) return;
    const text = override ?? draft;
    const parsed = config.parse ? config.parse(text) : { value: text.trim() };
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setStatus('saving');
    setError('');
    try {
      await onSave(parsed.value);
      setEditing(false);
      setStatus('idle');
    } catch {
      setStatus('error');
      setError('Could not save. Please try again.');
    }
  };

  // When another row's pencil is clicked while this one is still open,
  // save this one automatically (or just close it if nothing changed / it's invalid).
  useEffect(() => {
    if (!editing || activeKey === config.key || saving) return;
    const parsed = config.parse ? config.parse(draft) : { value: draft.trim() };
    if ('error' in parsed || (input === 'date' && draft === '') || parsed.value === value) {
      cancel();
    } else {
      void save();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') cancel();
    // Enter saves; in the address box Shift+Enter adds a new line instead.
    if (e.key === 'Enter' && !(input === 'textarea' && e.shiftKey)) {
      e.preventDefault();
      void save();
    }
  };

  let editor;
  if (input === 'select') {
    editor = (
      <CustomSelect
        value={draft}
        onChange={(v) => {
          // Picking an option saves it and closes the editor.
          setDraft(v);
          void save(v);
        }}
        defaultOpen
        className={inputClasses}
        placeholder="Not set"
        options={[{ value: '', label: 'Not set' }, ...(options ?? []).map((o) => ({ value: o.value, label: o.label }))]}
      />
    );
  } else if (input === 'date') {
    editor = (
      <div onKeyDown={onKeyDown}>
        <DateInput value={draft} onChange={setDraft} min="1900-01-01" max={toIsoDate()} className={inputClasses} autoFocus aria-label={label} />
      </div>
    );
  } else if (input === 'textarea') {
    editor = (
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        maxLength={config.maxLength}
        placeholder={config.placeholder}
        rows={3}
        autoFocus
        aria-label={label}
      />
    );
  } else {
    editor = (
      <Input
        type={input}
        inputMode={input === 'tel' ? 'tel' : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        maxLength={config.maxLength}
        placeholder={config.placeholder}
        invalid={!!error}
        autoFocus
        aria-label={label}
      />
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        {editing ? (
          <div className="mt-1.5 max-w-md">
            {editor}
            <div className="flex items-center gap-3 mt-2">
              {input !== 'select' && (
              <button
                type="button"
                onClick={() => void save()}
                disabled={!canSave}
                className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              )}
              <button
                type="button"
                onClick={cancel}
                disabled={saving}
                className="text-xs font-medium text-slate-600 hover:text-ink dark:hover:text-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-ink mt-0.5 break-words whitespace-pre-line">
              {!loaded && !fixedValue ? (
                <span className="inline-block h-4 w-32 rounded bg-surface-muted animate-pulse align-middle" />
              ) : display ? (
                display
              ) : (
                <span className="font-normal text-muted">Not set</span>
              )}
            </p>
            {config.hint && <p className="text-xs text-muted mt-1">{config.hint}</p>}
          </>
        )}
      </div>
      {!editing && !fixedValue && (
        <button
          type="button"
          onClick={start}
          disabled={!loaded}
          title={`Edit ${label.toLowerCase()}`}
          aria-label={`Edit ${label.toLowerCase()}`}
          className="shrink-0 mt-3 text-brand-600 dark:text-brand-400 hover:opacity-75 disabled:opacity-40"
        >
          <Pencil size={15} />
        </button>
      )}
    </div>
  );
}

/** Settings > Basic details: the person's own details, each one editable in place. */
export default function BasicDetailsCard() {
  const user = useAuthStore((s) => s.user);
  const details = useBasicDetailsStore((s) => s.details);
  const loaded = useBasicDetailsStore((s) => s.loaded);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  if (!user) return null;

  const accountEmail = user.email ?? '';

  const fields: FieldConfig[] = [
    { key: 'fullName', label: 'Full Name', input: 'text', maxLength: 80, placeholder: 'Your full name' },
    { key: 'dob', label: 'Date of Birth', input: 'date', format: isoToDisplay },
    { key: 'mobile', label: 'Mobile Number', input: 'tel', maxLength: 16, placeholder: '10-digit mobile number', parse: parseMobile, format: formatMobile },
    accountEmail
      ? { key: 'email', label: 'Email Address', input: 'email', fixedValue: accountEmail }
      : { key: 'email', label: 'Email Address', input: 'email', maxLength: 120, placeholder: 'you@example.com', parse: parseEmail },
    { key: 'maritalStatus', label: 'Marital Status', input: 'select', options: MARITAL_OPTIONS },
    {
      key: 'gender',
      label: 'Gender',
      input: 'select',
      options: GENDER_OPTIONS,
    },
    { key: 'incomeRange', label: 'Income Range', input: 'select', options: INCOME_OPTIONS },
    { key: 'occupation', label: 'Occupation', input: 'select', options: OCCUPATION_OPTIONS },
    { key: 'fatherName', label: "Father's Name", input: 'text', maxLength: 80, placeholder: "Your father's name" },
    { key: 'address', label: 'Address', input: 'textarea', maxLength: 250, placeholder: 'House / street, area, city, state, PIN code' },
  ];

  return (
    <div className="bg-surface rounded-2xl border border-line p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-ink mb-5">Personal Details</h2>
      <div className="divide-y divide-line-soft">
        {fields.map((f) => (
          <Row
            key={f.key}
            config={f}
            value={details[f.key] ?? ''}
            loaded={loaded}
            activeKey={activeKey}
            onActivate={setActiveKey}
            onSave={(value) => saveBasicDetails(user, { [f.key]: value || null })}
          />
        ))}
      </div>
    </div>
  );
}
