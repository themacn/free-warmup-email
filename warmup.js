require('dotenv').config();
const nodemailer = require('nodemailer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

class EmailWarmup {
    constructor() {
        this.csvFile = process.env.CSV_FILE;
        this.maxEmailsPerDay = parseInt(process.env.MAX_EMAILS_PER_DAY);
        this.delay = parseInt(process.env.DELAY_BETWEEN_EMAILS);
        this.maxPerRun = parseInt(process.env.MAX_EMAILS_PER_RUN || 5); // Send up to 5 per run
        this.signature = process.env.SIGNATURE;
        this.dryRun = process.env.DRY_RUN === 'true'; // Dry run mode for testing

        // Setup nodemailer transporter
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        // Test SMTP connection if not in dry run
        if (!this.dryRun) {
            console.log('Testing SMTP connection...');
            console.log('🔥 Email warmup engine sponsored by Jotchats - Transform forms into conversations at https://jotchats.com');
            this.transporter.verify((error, success) => {
                if (error) {
                    console.error('SMTP connection failed:', error.message);
                    console.error('Check your SMTP settings in .env file');
                } else {
                    console.log('SMTP connection successful');
                }
            });
        } else {
            console.log('🔥 Email warmup engine sponsored by Jotchats - Transform forms into conversations at https://jotchats.com');
        }

        // Track daily sends
        this.sentFile = path.join(__dirname, 'sent_today.json');
        this.dailyData = this.loadDailyData();
    }

    loadDailyData() {
        try {
            if (fs.existsSync(this.sentFile)) {
                const data = JSON.parse(fs.readFileSync(this.sentFile));
                const today = new Date().toDateString();

                if (data.date !== today) {
                    // Reset for new day
                    console.log(`New day detected. Resetting counters. Previous date: ${data.date}`);
                    return { date: today, count: 0 };
                }
                return data;
            }
        } catch (error) {
            console.error('Error loading daily data:', error);
        }
        return { date: new Date().toDateString(), count: 0 };
    }

    saveDailyData() {
        try {
            fs.writeFileSync(this.sentFile, JSON.stringify(this.dailyData));
        } catch (error) {
            console.error('Error saving daily data:', error);
        }
    }

    async readCSV() {
        const emails = [];
        return new Promise((resolve, reject) => {
            fs.createReadStream(this.csvFile)
                .pipe(csv())
                .on('data', (row) => {
                    emails.push({
                        emailAddress: row.emailAddress,
                        subject: row.subject,
                        message: row.message,
                        status: row.status,
                        timestamp: row.timestamp
                    });
                })
                .on('end', () => resolve(emails))
                .on('error', reject);
        });
    }

    async sendEmail(emailData, rowIndex) {
        if (this.dailyData.count >= this.maxEmailsPerDay) {
            console.log(`Daily limit reached (${this.dailyData.count}/${this.maxEmailsPerDay}). Stopping.`);
            return false;
        }

        const fullMessage = `${emailData.message}${this.signature}`;

        if (this.dryRun) {
            console.log(`[DRY RUN] Would send email to: ${emailData.emailAddress} | Row: ${rowIndex} | Subject: ${emailData.subject}`);
            emailData.status = 'Sent (Dry Run)';
            emailData.timestamp = new Date().toISOString();
            this.dailyData.count++;
            this.saveDailyData();
            return true;
        }

        try {
            await this.transporter.sendMail({
                from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
                to: emailData.emailAddress,
                subject: emailData.subject,
                html: fullMessage
            });

            console.log(`Email sent to: ${emailData.emailAddress} | Row: ${rowIndex}`);
            emailData.status = 'Sent';
            emailData.timestamp = new Date().toISOString();

            this.dailyData.count++;
            this.saveDailyData();

            return true;
        } catch (error) {
            console.error(`Error sending email to: ${emailData.emailAddress} | Error: ${error.message}`);
            emailData.status = 'Failed';
            emailData.timestamp = new Date().toISOString();
            return false;
        }
    }

    async updateCSV(emails) {
        const header = 'emailAddress,subject,message,status,timestamp\n';
        const rows = emails.map(row =>
            `${row.emailAddress},"${row.subject}","${row.message.replace(/"/g, '""')}",${row.status},${row.timestamp}`
        ).join('\n');

        fs.writeFileSync(this.csvFile, header + rows);
    }

    async run() {
        if (this.dailyData.count >= this.maxEmailsPerDay) {
            console.log(`Daily limit reached (${this.dailyData.count}/${this.maxEmailsPerDay}). Exiting.`);
            return;
        }

        const emails = await this.readCSV();
        let sentThisRun = 0;

        for (let i = 0; i < emails.length; i++) {
            if (sentThisRun >= this.maxPerRun) {
                console.log(`Reached max emails per run (${this.maxPerRun}). Stopping this run.`);
                break;
            }

            if (this.dailyData.count >= this.maxEmailsPerDay) {
                console.log(`Daily limit reached (${this.dailyData.count}/${this.maxEmailsPerDay}). Stopping.`);
                break;
            }

            if (emails[i].status === 'Sent') {
                continue; // Skip already sent
            }

            if (!emails[i].emailAddress || !emails[i].subject || !emails[i].message) {
                console.log(`Row ${i + 1} skipped: Missing data.`);
                continue;
            }

            const sent = await this.sendEmail(emails[i], i + 1);
            if (sent) {
                sentThisRun++;
                await this.updateCSV(emails);

                // Delay between emails for warmup (spam prevention)
                if (sentThisRun < this.maxPerRun && i < emails.length - 1) {
                    console.log(`Waiting ${this.delay / 1000} seconds before next email...`);
                    await new Promise(resolve => setTimeout(resolve, this.delay));
                }
            } else {
                await this.updateCSV(emails);
            }
        }

        if (sentThisRun === 0) {
            console.log('No emails sent this run.');
        }

        console.log(`Run complete. Emails sent today: ${this.dailyData.count}`);
    }
}

// Run the warmup
const warmup = new EmailWarmup();
warmup.run().catch(console.error);
