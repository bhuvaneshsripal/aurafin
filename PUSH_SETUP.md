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

## Weekly bank balance reminder
Every Sunday at 1:00 PM IST every registered phone gets "Update your bank
balance" (tap opens Wealth). It runs from
`.github/workflows/weekly-balance-reminder.yml` using the same `APP_URL` and
`CRON_SECRET` secrets, so no extra setup. To test now, open
`APP_URL/api/push/send?weekly=1&force=1` with the `Authorization: Bearer <CRON_SECRET>`
header, or run the workflow from the Actions tab with "Run workflow" (that run
only sends on Sunday 1 to 4 PM IST; use the force URL to test any time).

## Good to know
- Turning alerts off in the app, or signing out, stops them for that device.
- iPhone/iPad: works only after "Add to Home Screen" (iOS 16.4+).
- GitHub's scheduler can run a few minutes late; alerts may arrive slightly
  after the exact time. A delayed run only misses an alert if it lands outside
  that alert's window.
- Add a Firestore rule? Not needed: the existing `users/{uid}/{collection}` rule
  already covers `pushSubscriptions`, and the server uses admin access.

## Checking it works (Settings > "Alerts when the app is closed")
Open Settings, tap **Send a test notification**, then close the app. The card
tells you what is missing (server keys, no registered device, notifications
blocked) instead of staying silent.

## Phone offline or switched off
Alerts are held by Google/Apple/Mozilla's push service for up to 6 hours and
delivered the moment the phone reconnects. A newer alert with the same tag
replaces an older one still waiting, so you get the latest, not a pile.

## If alerts suddenly stop
- GitHub pauses scheduled workflows after 60 days with no repo activity. Open
  the Actions tab and re-enable "Push alerts" (or push any commit).
- A free alternative to the GitHub schedule: cron-job.org, calling
  `APP_URL/api/push/send` every 5 minutes with the header
  `Authorization: Bearer <CRON_SECRET>`.
- Open the app once on the device: it re-registers itself with the push service.

## Weekly portfolio digest email (Saturday 10:00 AM IST)
Settings > Notifications > "Weekly portfolio digest". The server emails it, so it
arrives whether or not the app is open.

1. Add two more environment variables on Vercel, then **redeploy**:

   | Name | Value |
   | --- | --- |
   | `SMTP_USER` | the mailbox that sends, e.g. `yourname@gmail.com` |
   | `SMTP_PASS` | for Gmail, an **App password** (Google Account > Security > 2-Step Verification > App passwords). Not your normal password. |

   Optional: `SMTP_HOST` (default `smtp.gmail.com`), `SMTP_PORT` (default `465`), `MAIL_FROM` (default `Aurafin <SMTP_USER>`).
2. `.github/workflows/weekly-digest.yml` calls the server at 10:00 AM IST every
   Saturday (plus two later safety-net runs; each person gets it once per Saturday).
   It uses the same `APP_URL` and `CRON_SECRET` GitHub secrets as the other workflows.
3. Test it: Settings > Notifications > **Email me this week's digest now**, or run
   the "Weekly digest email" workflow from the Actions tab.

Where the numbers come from:
- While the app is open it saves your holdings (valued exactly like the Dashboard)
  to Firestore. The server re-prices stocks / ETFs at send time (latest close) and
  compares with the close one week earlier for "this week".
- Mutual funds, SIPs, gold and deposits are shown as of your last visit to the app
  (the email prints that date). Open the app on Friday evening or Saturday morning
  for the freshest figures.
- Week-over-week figures cover stocks and ETFs only and ignore units bought or sold
  during the week.
- The email is only sent to the account's sign-in email. Guest accounts get none.

## Budget alerts
Settings > Notifications > "Budget alerts" adds a bell notification inside the app when a
category reaches 80% and 100% of its monthly budget (checked while the app is open).

## Notification switches sync across devices
The Settings > Notifications switches (and the Advanced options) are saved to Firestore at
`users/{uid}/meta/notificationPrefs`, so a change on one device appears on the others live. The most
recent change wins. No new rules or env vars are needed (the existing `users/{uid}/...` rule covers it).
Budget alerts use a fixed id per category / level / month, so each device shows an alert once.

## If alerts still don't arrive with the app closed
- Every push must show a notification. The service worker now always does (before, pushes that
  arrived while the app was open were skipped silently, and iPhone/Chrome then drop the subscription).
- After deploying, open the app on each phone, tap **Update** (Settings > New version), then in
  Settings tap **Send a test notification** and close the app. The push handler only changes once the
  new version is activated.
- Vercel > Logs: failed sends are now logged as `push failed <status> <host>`. 403 / 401 means
  `VAPID_PUBLIC_KEY` on Vercel is not the same key as `VITE_VAPID_PUBLIC_KEY` the app was built with.
- Android: Settings > Apps > Chrome (or the installed Aurafin) > Battery > **Unrestricted**, and don't
  "force stop" the app. Some brands (Xiaomi, Oppo, Vivo, Samsung "sleeping apps") kill background push.
- GitHub's 5-minute schedule is often 15+ minutes late. For on-time alerts also add a cron-job.org job.
