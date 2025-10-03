const nodemailer = require('nodemailer');

class EmailService {
  constructor(databaseService) {
    this.databaseService = databaseService;
    this.transporter = null;
    this.activeCampaigns = new Map(); // campaignId -> cron job
  }

  // Initialize SMTP transporter
  async initializeTransporter(settings) {
    if (!settings || !settings.smtp) {
      throw new Error('SMTP settings not configured');
    }

    const { host, port, secure, user, pass, fromEmail, fromName } = settings.smtp;

    if (!host || !user || !pass || !fromEmail) {
      throw new Error('Incomplete SMTP configuration');
    }

    this.transporter = nodemailer.createTransporter({
      host,
      port: parseInt(port) || 587,
      secure: secure === 'true' || secure === true,
      auth: {
        user,
        pass
      }
    });

    // Test the connection
    try {
      await this.transporter.verify();
      console.log('SMTP connection verified successfully');
      return { success: true };
    } catch (error) {
      console.error('SMTP verification failed:', error.message);
      throw new Error(`SMTP verification failed: ${error.message}`);
    }
  }

  // Send a single email
  async sendEmail(emailData) {
    if (!this.transporter) {
      throw new Error('Email service not initialized. Configure SMTP settings first.');
    }

    const { emailAddress, subject, body, signature, campaignId, contactId } = emailData;

    if (!emailAddress || !subject || !body) {
      throw new Error('Missing required email fields: emailAddress, subject, body');
    }

    // Check daily limits
    const canSend = await this.databaseService.canSendToday();
    if (!canSend) {
      throw new Error('Daily email limit reached');
    }

    // Get settings for signature and from details
    const settings = await this.databaseService.getSettings();
    const fullBody = `${body}${signature || settings.signature || ''}`;

    try {
      const mailOptions = {
        from: `"${settings.smtp?.fromName || 'Your Name'}" <${settings.smtp?.fromEmail || 'your@email.com'}>`,
        to: emailAddress,
        subject: subject,
        html: fullBody.replace(/\n/g, '<br>')
      };

      const info = await this.transporter.sendMail(mailOptions);

      console.log(`Email sent successfully to ${emailAddress}. Message ID: ${info.messageId}`);

      // Track the email sent
      if (contactId && campaignId) {
        await this.databaseService.trackEmailSent(contactId, campaignId, 'initial');
      }

      return {
        success: true,
        messageId: info.messageId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Failed to send email to ${emailAddress}:`, error.message);

      // Could track failed emails here if needed
      // await this.databaseService.trackEmailFailure(contactId, campaignId, error.message);

      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  // Send batch emails with interval control
  async sendBatchEmails(emailBatch, settings) {
    const results = [];
    const {
      delayBetweenEmails = 30000,
      maxPerBatch = 5
    } = settings.emailLimits || {};

    let emailsSentInBatch = 0;

    for (const emailData of emailBatch) {
      // Check if we've hit the max per batch
      if (emailsSentInBatch >= maxPerBatch) {
        break;
      }

      // Check daily limit
      const canSend = await this.databaseService.canSendToday();
      if (!canSend) {
        console.log('Daily email limit reached. Stopping batch send.');
        break;
      }

      try {
        const result = await this.sendEmail(emailData);
        results.push({
          ...result,
          contactId: emailData.contactId,
          emailAddress: emailData.emailAddress
        });
        emailsSentInBatch++;

        // Wait before next email (unless it's the last one)
        if (emailsSentInBatch < emailBatch.length && emailsSentInBatch < maxPerBatch) {
          console.log(`Waiting ${delayBetweenEmails/1000} seconds before next email...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenEmails));
        }

      } catch (error) {
        console.error(`Failed to send email to ${emailData.emailAddress}:`, error.message);
        results.push({
          success: false,
          error: error.message,
          contactId: emailData.contactId,
          emailAddress: emailData.emailAddress
        });

        // Continue with next email even if one fails
        emailsSentInBatch++;
      }
    }

    return results;
  }

  // Start automated campaign
  async startCampaign(campaignId) {
    const campaign = await this.databaseService.getCampaign(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (this.activeCampaigns.has(campaignId)) {
      throw new Error('Campaign is already running');
    }

    const settings = await this.databaseService.getSettings();

    // Initialize transporter if needed
    if (!this.transporter) {
      await this.initializeTransporter(settings);
    }

    const cron = require('node-cron');

    // Create cron job based on schedule
    let cronExpression;

    switch (campaign.schedule.frequency) {
      case 'daily':
        cronExpression = '0 9 * * *'; // Every day at 9 AM
        break;
      case 'weekly':
        cronExpression = '0 9 * * 1'; // Every Monday at 9 AM
        break;
      case 'hourly':
        cronExpression = '0 * * * *'; // Every hour
        break;
      default:
        cronExpression = '0 9 * * *'; // Daily default
    }

    const job = cron.schedule(cronExpression, async () => {
      try {
        await this.processCampaignBatch(campaignId, settings);
      } catch (error) {
        console.error(`Campaign ${campaignId} batch failed:`, error.message);
      }
    }, {
      scheduled: false // Don't start immediately
    });

    // Start the job
    job.start();
    this.activeCampaigns.set(campaignId, job);

    // Update campaign status
    await this.databaseService.saveCampaign({
      ...campaign,
      status: 'active',
      startedAt: new Date().toISOString()
    });

    // Immediately process the first batch
    await this.processCampaignBatch(campaignId, settings);

    console.log(`Campaign ${campaignId} started successfully`);
    return { success: true };
  }

  // Stop campaign
  async stopCampaign(campaignId) {
    const campaign = await this.databaseService.getCampaign(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const job = this.activeCampaigns.get(campaignId);
    if (job) {
      job.stop();
      this.activeCampaigns.delete(campaignId);

      // Update campaign status
      await this.databaseService.saveCampaign({
        ...campaign,
        status: 'paused',
        stoppedAt: new Date().toISOString()
      });

      console.log(`Campaign ${campaignId} stopped successfully`);
      return { success: true };
    } else {
      throw new Error('Campaign is not currently running');
    }
  }

  // Process a batch of emails for a campaign
  async processCampaignBatch(campaignId, settings) {
    const campaign = await this.databaseService.getCampaign(campaignId);
    if (!campaign || campaign.status !== 'active') {
      return;
    }

    const batchSize = campaign.schedule.batchSize || settings.emailLimits?.emailsPerBatch || 5;

    // Get contacts who haven't received emails yet from this campaign
    const contacts = campaign.contacts.filter(contact =>
      !contact.sentFromCampaign || !contact.sentFromCampaign.includes(campaignId)
    );

    if (contacts.length === 0) {
      console.log(`Campaign ${campaignId}: No more contacts to email`);
      // Could mark campaign as complete
      await this.databaseService.saveCampaign({
        ...campaign,
        status: 'completed'
      });
      await this.stopCampaign(campaignId);
      return;
    }

    // Take a batch of contacts
    const batchContacts = contacts.slice(0, batchSize);

    // Generate and send emails for batch
    const emailBatch = [];

    for (const contact of batchContacts) {
      // Here we could generate personalized emails using OpenRouter
      // For now, using campaign template
      const emailData = {
        emailAddress: contact.email,
        subject: campaign.template.subject,
        body: campaign.template.body,
        campaignId: campaignId,
        contactId: contact.id,
        signature: settings.signature
      };

      emailBatch.push(emailData);
    }

    // Send the batch
    const results = await this.sendBatchEmails(emailBatch, settings);

    // Update campaign with results
    const sentCount = results.filter(r => r.success).length;
    const updatedCampaign = {
      ...campaign,
      stats: {
        ...campaign.stats,
        sent: (campaign.stats.sent || 0) + sentCount
      },
      lastBatchSent: new Date().toISOString()
    };

    await this.databaseService.saveCampaign(updatedCampaign);

    console.log(`Campaign ${campaignId} batch complete. Sent: ${sentCount}/${emailBatch.length}`);

    return results;
  }

  // Send follow-up emails
  async sendFollowupEmails() {
    const pendingFollowups = await this.databaseService.getPendingFollowups();

    if (pendingFollowups.length === 0) {
      return { message: 'No pending followups' };
    }

    console.log(`Processing ${pendingFollowups.length} pending followups`);

    for (const followup of pendingFollowups) {
      try {
        // Generate followup email content (could use OpenRouter)
        const emailData = {
          emailAddress: followup.contact.email,
          subject: followup.followup.subject,
          body: followup.followup.body,
          campaignId: followup.followup.campaignId,
          contactId: followup.contactId,
          signature: (await this.databaseService.getSettings()).signature
        };

        await this.sendEmail(emailData);

        // Mark followup as sent
        await this.databaseService.markFollowupSent(followup.contactId, followup.followup.id);

        console.log(`Followup sent to ${followup.contact.email} (${followup.followup.type})`);

      } catch (error) {
        console.error(`Failed to send followup to ${followup.contact.email}:`, error.message);

        // Could implement retry logic here
        // For now, we leave the followup as pending
      }
    }

    return { message: `Processed ${pendingFollowups.length} followups` };
  }

  // Schedule followups for a contact
  async scheduleFollowups(contactId, campaignSettings) {
    const followups = campaignSettings.followups || [];

    for (const followup of followups) {
      if (followup.enabled && followup.daysAfter && followup.daysAfter > 0) {
        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + followup.daysAfter);

        await this.databaseService.scheduleFollowup(contactId, {
          type: 'followup',
          subject: followup.subject,
          body: followup.body,
          scheduledFor: scheduledDate.toISOString(),
          campaignId: campaignSettings.campaignId
        });
      }
    }
  }

  // Test email sending
  async sendTestEmail(emailAddress, settings) {
    if (!this.transporter) {
      await this.initializeTransporter(settings);
    }

    const testEmail = {
      emailAddress,
      subject: 'Test Email from Cold Email Service',
      body: 'This is a test email to verify your SMTP configuration is working correctly. If you received this email, your email settings are properly configured!',
      signature: settings.signature
    };

    return await this.sendEmail(testEmail);
  }

  // Get email service status
  async getStatus() {
    const settings = await this.databaseService.getSettings();
    const dailyStats = await this.databaseService.getDailyStats();
    const stats = await this.databaseService.getStats();

    return {
      smtpConfigured: !!(settings.smtp?.host && settings.smtp?.user && settings.smtp?.pass),
      smtpVerified: !!this.transporter,
      activeCampaigns: Array.from(this.activeCampaigns.keys()),
      dailyStats,
      overallStats: stats
    };
  }

  // Clean up resources
  async cleanup() {
    // Stop all active campaigns
    for (const [campaignId, job] of this.activeCampaigns.entries()) {
      try {
        job.stop();
        console.log(`Stopped campaign ${campaignId}`);
      } catch (error) {
        console.error(`Error stopping campaign ${campaignId}:`, error.message);
      }
    }

    this.activeCampaigns.clear();

    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }
}

module.exports = EmailService;
