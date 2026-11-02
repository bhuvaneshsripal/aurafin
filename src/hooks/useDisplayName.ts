import { useAuthStore } from '../store/authStore';
import { useBasicDetailsStore } from '../store/basicDetailsStore';

/**
 * The name to show for the signed-in person: the Full Name saved in
 * Settings > Basic details, then the account's display name, then the email.
 */
export function useDisplayName(fallback = ''): string {
  const user = useAuthStore((s) => s.user);
  const fullName = useBasicDetailsStore((s) => s.details.fullName);
  return fullName?.trim() || user?.displayName || user?.email || fallback;
}
