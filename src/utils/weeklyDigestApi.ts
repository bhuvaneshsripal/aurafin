/** Asks the server to email the signed-in person their weekly digest right now (Settings > Notifications). */
export async function sendTestDigest(): Promise<{ ok: boolean; message: string }> {
  try {
    const { auth } = await import('../firebase/config');
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { ok: false, message: 'Sign in first.' };
    const res = await fetch('/api/push/test?digest=1', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; sent?: number; error?: string } | null;
    if (body?.ok) return { ok: true, message: `Sent to ${auth.currentUser?.email ?? 'your email'}. Check your inbox (and spam) in a minute.` };
    if (!body) {
      return {
        ok: false,
        message:
          res.status === 404
            ? 'The digest server route was not found on this deployment. Push the latest code to GitHub and redeploy on Vercel.'
            : `The server could not send it (HTTP ${res.status}). Check Vercel > Logs for /api/push/test.`,
      };
    }
    return { ok: false, message: `Could not send: ${body.error ?? 'unknown error'}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error' };
  }
}
