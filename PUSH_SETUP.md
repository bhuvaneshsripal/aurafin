# Alerts when the app is closed (Web Push)

The app can only raise alerts while it is open. To get them with the app
closed, a server has to send them. This is already built; it needs a one-time
setup (about 10 minutes, all free).

## 1. Make a VAPID key pair
Run once on your computer: `npx web-push generate-vapid-keys`
You get a Public Key and a Private Key. Keep the private one secret.

## 2. Make a Firebase service account
Firebase console > Project settings > Service accounts > Generate new private
key. Open the downloaded JSON, copy everything, and paste it as one line.

## 3. Add environment variables on Vercel (Project > Settings > Environment Variables)
| Name | Value |
| --- | --- |
| `VITE_VAPID_PUBLIC_KEY` | the Public Key |
| `VAPID_PUBLIC_KEY` | the same Public Key |
| `VAPID_PRIVATE_KEY` | the Private Key |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `FIREBASE_SERVICE_ACCOUNT` | the service-account JSON |
| `CRON_SECRET` | any long random string |

Then **redeploy** (the public key is baked in at build time).

## 4. Start the schedule (GitHub)
Push this project to GitHub. Repo > Settings > Secrets and variables > Actions,
add `APP_URL` (e.g. `https://aurafin-five.vercel.app`) and `CRON_SECRET` (same
value as Vercel). `.github/workflows/push-alerts.yml` then calls the sender
every 5 minutes on weekdays, 9:00 to 17:00 IST. (Vercel's free plan only allows
a daily cron, which is why GitHub is used.)

## 5. Turn it on in the app
Open the app on each device, allow notifications, and use it once. The device
registers itself. Test: open `APP_URL/api/push/send?test=1` with the header
`Authorization: Bearer <CRON_SECRET>` (or run the workflow once from the
Actions tab); every registered device shows a test notification.

## What gets sent
Pre-open (9:00), open (9:15), close (3:30 PM) per index; Nifty/Sensex/Bank Nifty
moves of 2% and 5%; and each person's own holdings moving 2% and 5%. Each goes
out once a day. When the app is open and on screen it alerts by itself and the
server's copy is skipped, so you don't get doubles.

## Good to know
- Turning alerts off in the app, or signing out, stops them for that device.
- iPhone/iPad: works only after "Add to Home Screen" (iOS 16.4+).
- GitHub's scheduler can run a few minutes late; alerts may arrive slightly
  after the exact time. A delayed run only misses an alert if it lands outside
  that alert's window.
- Add a Firestore rule? Not needed: the existing `users/{uid}/{collection}` rule
  already covers `pushSubscriptions`, and the server uses admin access.
