# Citeral authentication setup

Citeral intentionally supports only:

- email + password
- Google OAuth
- GitHub OAuth

The application does not expose Microsoft/Azure or other social providers.

## 1. Supabase URL configuration

In Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `https://citeral.vercel.app`
- Redirect URL: `https://citeral.vercel.app/auth/callback`
- Redirect URL for local development: `http://localhost:3000`
- Redirect URL for local OAuth: `http://localhost:3000/auth/callback`

The email signup and recovery flows pass the current application origin as `RedirectTo`. The hosted email templates below turn that origin into the server-side `/auth/confirm` PKCE exchange route.

Only add Vercel preview wildcards if preview OAuth/email testing is actually required. Production should use the exact URL above.

## 2. Email provider

Authentication → Sign In / Providers → Email:

- Enable Email provider.
- Enable email + password sign-in.
- Keep Confirm email enabled.
- Do not enable anonymous sign-in.
- Citeral does not use Magic Link/OTP as a login choice.

Supabase's built-in SMTP is for development/demo use and is heavily restricted. Before a public launch, configure your own SMTP under Authentication → Email / SMTP.

## 3. Google OAuth

Create a Google OAuth 2.0 Web application.

Authorized redirect URI:

`https://tyrvohvxztmrvhsqtjtn.supabase.co/auth/v1/callback`

Use Citeral as the app name. The app only needs the standard identity scopes (openid, email, profile).

Then Supabase Dashboard → Authentication → Sign In / Providers → Google:

- Enable Google.
- Paste the Google Client ID.
- Paste the Google Client Secret.
- Save.

Do not put the Google client secret in Vercel or any `NEXT_PUBLIC_` environment variable.

## 4. GitHub OAuth

Create one GitHub OAuth App.

- Application name: Citeral
- Homepage URL: `https://citeral.vercel.app`
- Authorization callback URL: `https://tyrvohvxztmrvhsqtjtn.supabase.co/auth/v1/callback`

Then Supabase Dashboard → Authentication → Sign In / Providers → GitHub:

- Enable GitHub.
- Paste the Client ID.
- Paste the Client Secret.
- Save.

The GitHub client secret belongs only in Supabase's provider configuration.

## 5. Disable every other provider

Authentication → Sign In / Providers:

- Google: enabled
- GitHub: enabled
- Email: enabled
- All other social providers: disabled
- Phone: disabled unless Citeral deliberately adds phone authentication later
- Anonymous: disabled

## 6. Email templates

Supabase Dashboard → Authentication → Email Templates.

### Confirm signup
Subject: `Confirm your Citeral email`

Copy `supabase/templates/confirmation.html`.

### Invite user
Subject: `You've been invited to Citeral`

Copy `supabase/templates/invite.html`.

### Magic link
Citeral does not expose magic-link login in the product UI, but the branded fallback template is kept in source control in case the provider sends one during administration/testing.
Subject: `Your Citeral sign-in link`

Copy `supabase/templates/magic_link.html`.

### Reauthentication / verification code
Subject: `Your Citeral verification code`

Copy `supabase/templates/reauthentication.html`.

### Reset password / Recovery
Subject: `Reset your Citeral password`

Copy `supabase/templates/recovery.html`.

### Change email
Subject: `Confirm your new Citeral email`

Copy `supabase/templates/email_change.html`.

### Password changed notification
Enable the password-changed security notification if available on the current plan.
Subject: `Your Citeral password was changed`

Copy `supabase/templates/password_changed_notification.html`.

### Email changed notification
Enable the email-changed security notification if available.
Subject: `Your Citeral email was changed`

Copy `supabase/templates/email_changed_notification.html`.

### Identity linked / unlinked
If these security notifications are enabled:
- `A sign-in method was linked to Citeral`
- `A sign-in method was removed from Citeral`

Use the matching templates in `supabase/templates/`.

## 7. Recovery flow

1. User opens `/forgot-password`.
2. Citeral calls `resetPasswordForEmail` with the current application origin.
3. Recovery email points to `/auth/confirm?token_hash=...&type=recovery&next=/reset-password`.
4. `/auth/confirm` verifies the token server-side and writes the authenticated recovery session to cookies.
5. `/reset-password` validates that session before showing the password fields.
6. User enters and confirms a new password.
7. Citeral updates the password, signs out the recovery session, and returns the user to normal sign-in.

## 8. OAuth flow

1. User selects Google or GitHub.
2. Citeral calls `signInWithOAuth` with `/auth/callback`.
3. Provider redirects to Supabase Auth at `/auth/v1/callback`.
4. Supabase redirects to Citeral `/auth/callback` with a PKCE authorization code.
5. Citeral exchanges the code server-side and stores the session in cookies.
6. User lands in `/app`.

## 9. SMTP

Do not consider the production email flow complete while using Supabase's demonstration SMTP. Configure a custom SMTP sender before opening signup broadly.

When using a third-party email provider, disable click/open tracking for Auth mail if the provider rewrites links. Rewritten confirmation/recovery links can break Supabase token verification.

Recommended sender identity once a Citeral domain exists:

- From name: `Citeral`
- From address: `auth@your-citeral-domain`
- Reply-to: a monitored support address

## 10. Source-controlled template rule

Keep Supabase Dashboard templates synchronized with `supabase/templates/`. The repository versions deliberately avoid external images and inline SVG so the Supabase preview and major mail clients do not depend on remote image loading.

## 11. Final tests

Test in an incognito/private browser:

1. Email signup → confirmation → `/app`.
2. Duplicate email signup does not reveal sensitive account state.
3. Email/password login.
4. Wrong password error.
5. Forgot password → recovery email → new password → normal login.
6. Reusing the same recovery link fails.
7. Google signup/login.
8. GitHub signup/login.
9. OAuth cancellation returns to the Auth error flow.
10. Sign out and verify `/app` is no longer accessible.
11. Check mobile layouts at 360/390 px.
12. Check Supabase Auth logs for provider or SMTP errors.
