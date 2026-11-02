import { useAuthStore } from '../store/authStore';
import { useAvatarStore } from '../store/avatarStore';
import { useBasicDetailsStore } from '../store/basicDetailsStore';
import { getDemoAvatar, type AvatarGender } from '../utils/demoAvatar';

/**
 * The gender saved in Settings > Basic details, used to pick the demo avatar.
 * Undefined until it has been set, in which case demo users get the male avatar.
 */
export function useUserGender(): AvatarGender | undefined {
  return useBasicDetailsStore((s) => s.details.gender);
}

/**
 * The picture to show for the signed-in account, in priority order:
 *   1. a photo the user uploaded in Settings,
 *   2. their Google photo,
 *   3. demo accounts only: an illustrated avatar that follows their gender,
 *   4. null, so the caller shows the initial instead.
 *
 * Every place that shows the account picture should use this.
 */
export function useAvatarUrl(): string | null {
  const user = useAuthStore((s) => s.user);
  const uploaded = useAvatarStore((s) => s.dataUrl);
  const gender = useUserGender();

  if (uploaded) return uploaded;
  if (user?.photoURL) return user.photoURL;
  // A demo account is an anonymous (guest) Firebase user.
  if ((user as { isAnonymous?: boolean } | null)?.isAnonymous === true) return getDemoAvatar(gender);
  return null;
}
