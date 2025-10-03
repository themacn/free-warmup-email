# Email Warmup Script

A Node.js script to warmup your email domain by sending emails from a CSV list using SMTP and Nodemailer.

This script mimics the behavior of the Google Apps Script version but uses Node.js for more flexibility.

## ⚡ Sponsored by [Jotchats](https://jotchats.com)

<div align="center">
  <a href="https://jotchats.com">
    <img src="jotchats-logo.jpg" alt="Jotchats Logo" width="150" height="auto">
  </a>
</div>

**Transform traditional web forms into engaging, AI-powered conversations.**

We created Jotchats to transform traditional web forms into engaging, AI-powered conversations. Instead of asking users to fill out static fields, we guide them through a natural, full-screen dialogue that feels more like chatting with a helpful assistant.

Our mission is to help businesses collect data more effectively, increase conversion rates, and deliver a personalized experience that reflects their brand. Whether it's lead capture, onboarding, surveys, or feedback, we make it easier for users to respond. We've seen response rates improve significantly compared to standard forms.

We also offer smart integrations, analytics, and customization options so teams can embed our conversational interface seamlessly into their websites or apps. If you're looking to replace clunky forms with something that actually drives results, [we're here to help](https://jotchats.com).

## Features

- Reads emails from CSV file
- Sends emails with custom signature
- Tracks daily send limits (48 emails per day)
- Updates CSV with send status and timestamp
- Daily counter reset
- Sends up to 5 emails per script execution with mandatory delays between each (5 minutes)
- Respects daily limit of 48 emails
- Includes spam prevention delays to follow cold emailing best practices

## Setup

1. **Clone and install dependencies:**
   ```bash
   git clone [your-repo-url]
   cd email-warmup-script
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` with your actual SMTP credentials:
   - For Gmail: Use an app password, not your regular password
   - For Zoho: Use an app-specific password from web interface
   - For other providers: Check their SMTP documentation

3. **Prepare your CSV file:**
   - Copy `WarmUpSheet.example.csv` to `WarmUpSheet.csv`
   - Replace with your own email list
   - Ensure CSV format matches: `emailAddress,subject,message,status,timestamp`

## CSV Format

The script expects a CSV file with headers:
```
emailAddress,subject,message,status,timestamp
```

- `emailAddress`: Recipient email
- `subject`: Email subject
- `message`: Email body (HTML allowed)
- `status`: Will be set to 'Sent' or 'Failed'
- `timestamp`: Send timestamp

## Usage

First, configure `.env` with your SMTP credentials and set `DRY_RUN=false` when ready to send real emails.

To test without sending emails, keep `DRY_RUN=true` in `.env`.

To send emails, run:
```bash
npm start
```

The script will:
1. Check if daily limit is reached
2. Find the next unsent email
3. Send it with the signature appended (or log in dry run mode)
4. Update the CSV with status and timestamp
5. Track daily count
6. Wait 5 minutes between emails (or configured delay)

Run the script multiple times (manually or via cron) to send more emails, respecting the daily limit.

## Reset Daily Counter

To manually reset the daily counter (useful for testing):
```bash
node -e "require('fs').unlinkSync('sent_today.json')"
```

## Customization

- Modify limits in `.env`
- Change signature in `.env`
- Adjust sending behavior in `warmup.js` (e.g., send multiple per run with delays)

## Safety Notes

- Test with small email lists first
- Monitor your email provider's sending limits
- Be aware of anti-spam policies
- Use ethical warming practices

## Migration from Google Apps Script

This replaces the Google Apps Script functionality. You'll need:
- A server or scheduled job to run `npm start` periodically
- SMTP credentials instead of GmailApp
- Manual trigger management instead of Apps Script triggers
