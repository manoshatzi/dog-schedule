# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Supabase

Copy `.env.example` to `.env.local` and set the project URL and publishable key from your Supabase project's API settings. `.env.local` is ignored by Git. Never put a Supabase secret or service-role key in the app.

Apply [`supabase/migrations/202610090001_shared_households.sql`](supabase/migrations/202610090001_shared_households.sql) in the Supabase Dashboard SQL Editor before opening the app. It creates household membership, daily needs, invite RPCs, Row Level Security, and Realtime publication. The app then supports email/password accounts, creating or joining one household, and shared live needs. New accounts may need to confirm their email before signing in.

If the household schema is already installed, also apply [`supabase/migrations/202610100001_need_schedule_options.sql`](supabase/migrations/202610100001_need_schedule_options.sql) to add need types, durations, and repeat days.

Apply [`supabase/migrations/202610110001_today_occurrences.sql`](supabase/migrations/202610110001_today_occurrences.sql) to enable shared daily booking and completion status on the Today screen.

Apply [`supabase/migrations/202610120001_task_booking_options.sql`](supabase/migrations/202610120001_task_booking_options.sql) to enable household-member assignment and booking preferences from the Book Task screen.

Apply [`supabase/migrations/202610130001_weekly_booking_repeats.sql`](supabase/migrations/202610130001_weekly_booking_repeats.sql) so repeating bookings appear across week navigation and remain scheduled after completion.

Apply [`supabase/migrations/202610140001_mvp_task_model.sql`](supabase/migrations/202610140001_mvp_task_model.sql) for the MVP task model: a `dogs` table, member display names, the Vet type, amounts, one-off dates, default assignees, reminder defaults, soft-deleted tasks, repeating claims (`claim_series`) and the guarded `transition_occurrence` RPC that the app now uses for claim / release / take over / done / undo. It is additive; older builds keep working through the legacy `set_daily_need_occurrence` RPC. This app version requires it.

Apply [`supabase/migrations/202610150001_push_notifications.sql`](supabase/migrations/202610150001_push_notifications.sql) for push notifications: `households.timezone`, `push_tokens`, `notification_preferences`, the `notification_outbox` (+ `push_tickets`), triggers that queue event pushes, `enqueue_due_notifications()` for reminders / unclaimed / overdue, and the RPCs the `send-push` Edge Function uses. It is additive and safe to apply before the push setup below is finished (nothing is sent until the function and cron job exist). See "Push notifications" below.

After applying the migrations, restart Expo. The first family member creates a family and shares its invite code (Routine → gear icon). Other members create their own accounts and join with that code.

### Auth settings (Supabase Dashboard → Authentication)

- **URL Configuration → Redirect URLs:** add `dogschedule://**` (and your dev-client URL, e.g. `exp+dog-schedule://**`). Email confirmation and password-reset links open the app with these.
- **Sign In / Providers → Apple:** enable it and add the iOS bundle ID `com.manoshatzi.dog-schedule` as a client ID so native Sign in with Apple tokens are accepted. Sign in with Apple also needs a development build (`yarn expo run:ios` or `yarn dlx eas-cli@latest build --profile development`); it is not available on Android.

See [`docs/architecture.md`](docs/architecture.md) for the data model and the guarded state transitions.

### Push notifications

Push is server-scheduled: database triggers and a per-minute `pg_cron` job write to `notification_outbox`; the `send-push` Edge Function sends it through the Expo Push API (details in [`docs/architecture.md`](docs/architecture.md) §8). Push does **not** work in Expo Go; use a development build on a real device (Android emulators with Google Play services and recent iOS simulators can also receive pushes, but test reminders on real phones).

1. **EAS project:** `yarn dlx eas-cli@latest init` adds `expo.extra.eas.projectId` to `app.json` (needed for Expo push tokens). Set `expo.android.package` in `app.json` (for example `com.manoshatzi.dogschedule`) before the first Android build.
2. **iOS (APNs):** a paid Apple Developer account. On the first `yarn dlx eas-cli@latest build --profile development --platform ios`, answer yes to "Setup Push Notifications" / "Generate a new Apple Push Notifications service key" (or run `yarn dlx eas-cli@latest credentials`). Register test devices first.
3. **Android (FCM V1):** create a Firebase project with the Android package, download `google-services.json` to the project root and set `expo.android.googleServicesFile` to `./google-services.json`. Generate a service-account key (Firebase → Settings → Service accounts) and upload it with `yarn dlx eas-cli@latest credentials` → Android → Google Service Account → FCM V1. Never commit the service-account JSON (see `.gitignore`).
4. **New development build** after adding `expo-notifications`: `yarn dlx eas-cli@latest build --profile development` (or `yarn expo run:ios|android`).
5. **Supabase extensions:** Dashboard → Database → Extensions: enable `pg_cron` and `pg_net` (Vault is on by default).
6. **Edge Function:** with the Supabase CLI, `supabase link --project-ref <ref>`, then
   ```bash
   supabase secrets set PUSH_CRON_SECRET="$(openssl rand -hex 32)"   # note the value
   supabase functions deploy send-push --no-verify-jwt
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the function by Supabase. Optional: if you turn on "Enhanced push security" in EAS, also set `EXPO_ACCESS_TOKEN`.
7. **Vault secrets + cron** (SQL editor):
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-push', 'push_send_url');
   select vault.create_secret('<same value as PUSH_CRON_SECRET>', 'push_cron_secret');
   select public.schedule_push_jobs();  -- needed if pg_cron was enabled after the migration
   ```
   `push-tick` runs every minute (queue due reminders, then call the function only when there is work); `push-cleanup` runs daily. Check them with `select * from cron.job;` and `select * from cron.job_run_details order by start_time desc limit 20;`.
8. **Debugging:** `select kind, status, skip_reason, last_error, send_after from notification_outbox order by id desc limit 50;` shows what was queued, skipped (muted, quiet hours, state changed, no device) or sent.

The app asks for permission in context: a soft prompt after your first claim, or **Turn on reminders** in Routine → gear (which also holds the notification toggles until the Settings screen exists).

## Get started

1. Install dependencies

   ```bash
   yarn install
   ```

2. Start the app

   ```bash
   yarn expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

### Other setup steps

- To set up ESLint for linting, run `yarn expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
