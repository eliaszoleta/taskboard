# Achiever Board — Supabase Auth email templates

Where to paste these: **Supabase Dashboard → Authentication → Email Templates**
(one tab per template type). Each file below maps to one tab. Paste the HTML
into the template body box, and set the **Subject heading** field to the
subject line noted at the top of each file.

These only take effect once Custom SMTP (Resend) is enabled under
**Project Settings → Authentication → SMTP Settings** — until then Supabase
sends with its own default template/sender, ignoring these.

Files:
- `confirm-signup.html` → tab "Confirm signup"
- `reset-password.html` → tab "Reset password"
- `change-email.html`   → tab "Change Email Address"

Supabase's template variables used here: `{{ .ConfirmationURL }}` (and
`{{ .SiteURL }}` in the footer link). Don't rename or remove those —
Supabase substitutes them at send time.

Design notes: kept intentionally simple/table-based (no external images,
no SVG) since email clients like Outlook and Gmail strip or mangle those
inconsistently — the wordmark is plain styled text so it renders identically
everywhere. Primary color (#4f6ef5) matches the site header/logo.
