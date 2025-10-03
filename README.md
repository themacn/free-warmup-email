# Cold Email Service

An Electron-based cold email automation tool with LinkedIn scraping and AI-powered personalized email generation.

## ⚡ Features

- **LinkedIn Scraping**: Extract contact information from LinkedIn profiles
- **AI-Powered Emails**: Generate personalized emails using OpenRouter API
- **Email Automation**: Send emails in batches with configurable delays
- **Follow-up Scheduling**: Automatically schedule and send follow-up emails
- **Campaign Management**: Create and manage multiple email campaigns
- **Daily Limits**: Built-in rate limiting to protect your email reputation

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and npm
- OpenRouter API key (for AI email generation)
- SMTP email credentials (Gmail, Outlook, etc.)
- LinkedIn account (for scraping)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd cold-email-service
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the application:**
   ```bash
   npm start
   ```

### Configuration

1. **SMTP Settings**: Configure your email provider settings in the Settings tab
2. **OpenRouter API**: Add your API key to enable AI email generation
3. **LinkedIn Credentials**: Set up LinkedIn scraping (use cautiously, respect terms of service)

## 📋 Usage

### 1. Import Contacts

- Click "Import LinkedIn Profile" in the Contacts tab
- Enter a LinkedIn profile URL (e.g., `https://www.linkedin.com/in/username`)
- Optionally add an email address if available
- The system will scrape profile information and save the contact

### 2. Generate Personalized Emails

- Select a contact from your contacts list
- Click "Generate Email" to create an AI-powered email
- Customize the email content as needed

### 3. Create Campaigns

- Go to the Campaigns tab
- Click "New Campaign"
- Set campaign parameters:
  - Name and description
  - Email tone and length
  - Sending frequency
  - Value proposition and call-to-action

### 4. Start Automation

- Launch campaigns to automatically send emails
- Monitor progress in the dashboard
- View stats and performance metrics

## 🛡️ Safety & Best Practices

### LinkedIn Scraping
- Use LinkedIn scraping responsibly
- Respect platform terms of service
- Only scrape publicly available information
- Consider getting explicit permission for outreach

### Email Sending
- Respect daily sending limits (typically 50-100 emails/day)
- Warm up new email accounts gradually
- Monitor for bounce rates and spam complaints
- Use clear unsubscribe mechanisms

### Legal Compliance
- Obtain proper consent for email marketing
- Comply with GDPR, CAN-SPAM, and local email laws
- Provide clear opt-out mechanisms
- Maintain proper contact lists

## 🔧 Configuration Options

### SMTP Settings
- Host, port, and authentication details
- Custom email signature
- Test connection before sending

### AI Email Generation
- OpenRouter API integration
- Model selection (Claude, GPT, Gemini)
- Tone and length customization

### Email Limits
- Daily sending limits
- Batch sizes (recommended: 5 emails)
- Delays between emails (30+ seconds)
- Delays between batches (5+ minutes)

### LinkedIn Integration
- Automated profile scraping
- Contact information extraction
- Manual login for access

## 📊 Features Overview

| Feature | Description |
|---------|-------------|
| **Contact Management** | Import, organize, and manage contacts from LinkedIn |
| **AI Email Generation** | Create personalized emails using advanced AI models |
| **Campaign Automation** | Schedule and automate email campaigns |
| **Follow-up Sequences** | Automatically send follow-up emails |
| **Rate Limiting** | Prevent account suspension with built-in delays |
| **Analytics** | Track campaign performance and email metrics |
| **Settings Management** | Configure SMTP, API keys, and sending limits |

## 🏗️ Architecture

### Core Components

- **Electron Main Process**: Application lifecycle, IPC communication
- **Database Service**: Contact and campaign data management (LowDB)
- **LinkedIn Scraper**: Automated profile data extraction (Puppeteer)
- **Email Service**: SMTP emailing with rate limiting (Nodemailer)
- **OpenRouter Service**: AI-powered email content generation
- **UI Components**: Modern interface built with DaisyUI

### Database Schema

```javascript
// Contacts
{
  id: string,
  linkedinUrl: string,
  fullName: string,
  headline: string,
  company: string,
  location: string,
  email: string,
  scrapedAt: date,
  emailSent: number,
  followupsRemaining: array
}

// Campaigns
{
  id: string,
  name: string,
  status: enum,
  contacts: array,
  schedule: object,
  stats: object
}
```

## ⚠️ Disclaimer

This tool is for educational and professional networking purposes only. Always respect:
- LinkedIn Terms of Service
- Email provider policies
- Anti-spam regulations
- Individual privacy rights

The authors are not responsible for misuse of this software.

## 🔄 Updates & Support

For updates, bug reports, and feature requests, please check the GitHub repository.

---

**Built with ❤️ for ethical cold email outreach**
