import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Modal from './Modal';
import { checkAccessPassword } from '../config/accessGate';

interface AccessPasswordModalProps {
  open: boolean;
  onClose: () => void;
  /** Called once the correct password has been entered. */
  onUnlock: () => void;
  /** When true, a "Contact us" button (opens LinkedIn) is shown below Continue, for people who don't have the password. */
  contactOnly?: boolean;
}

export const CONTACT_URL = 'https://www.linkedin.com/in/bhuvaneshs07';

/** Asks for the access password before login, sign-up or the demo. */
export default function AccessPasswordModal({ open, onClose, onUnlock, contactOnly = false }: AccessPasswordModalProps) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');

  // Start clean every time the dialog is opened.
  useEffect(() => {
    if (open) {
      setValue('');
      setShow(false);
      setError('');
    }
  }, [open]);

  const submit = () => {
    if (!value.trim()) {
      setError('Enter the password');
      return;
    }
    if (!checkAccessPassword(value)) {
      setError('Incorrect password. Please try again.');
      return;
    }
    onUnlock();
  };

  return (
    <Modal open={open} onClose={onClose} title="Enter password">
      <div className="login-modal-body">
        <p className="text-ink-2 text-[0.875em] mb-[1em]">{contactOnly ? 'Sign-up needs an access password. Enter it below, or tap Contact us to get access.' : 'Enter the access password to continue.'}</p>
        <form
          className="login-fields"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className={`lf${error ? ' lf-err' : ''}`}>
            <input
              id="access-password"
              type={show ? 'text' : 'password'}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              placeholder=" "
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError('');
              }}
              aria-invalid={!!error}
              className="lf-input has-eye"
            />
            <label htmlFor="access-password" className="lf-label">Password<span className="lf-star" aria-hidden="true">*</span></label>
<span className="lf-req" aria-hidden="true">*</span>
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              tabIndex={-1}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="lf-eye"
            >
              {show ? <EyeOff size="1.125em" /> : <Eye size="1.125em" />}
            </button>
            {error && (
              <p className="lf-msg" role="alert">
                {error}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="btn-press login-btn bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-medium"
          >
            Continue
          </button>
          {contactOnly && (
            <a
              href={CONTACT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="btn-press login-btn border border-brand-600 text-brand-600 hover:bg-brand-50 font-medium flex items-center justify-center"
            >
              Contact us
            </a>
          )}
        </form>
      </div>
    </Modal>
  );
}
