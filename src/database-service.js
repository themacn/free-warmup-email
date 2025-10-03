const lowdb = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');

class DatabaseService {
  constructor() {
    // Ensure database directory exists
    const dbDir = path.join(__dirname, '../database');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.dbPath = path.join(dbDir, 'cold-email-db.json');

    // Initialize lowdb with FileSync adapter
    const adapter = new FileSync(this.dbPath);
    this.db = lowdb(adapter);

    // Initialize database with default data
    this.initializeDatabase();
  }

  initializeDatabase() {
    // Default data structure
    const defaultData = {
      contacts: [],
      campaigns: [],
      settings: {
        smtp: {
          host: '',
          port: 587,
          secure: false,
          user: '',
          pass: '',
          fromEmail: '',
          fromName: ''
        },
        linkedin: {
          sessionCookies: '',
          loginEmail: '',
          loginPassword: ''
        },
        openrouter: {
          apiKey: '',
          model: 'anthropic/claude-3-haiku'
        },
        emailLimits: {
          dailyLimit: 50,
          emailsPerBatch: 5,
          delayBetweenEmails: 30000, // 30 seconds
          delayBetweenBatches: 300000 // 5 minutes
        },
        signature: '<br><br>Best regards,<br>Your Name<br>Email: your@email.com<br>Phone: (+1) 123-456-7890'
      },
      dailyStats: {
        date: new Date().toDateString(),
        sentToday: 0
      }
    };

    return this.db.defaults(defaultData).write();
  }

  // Contact management
  getAllContacts() {
    return this.db.get('contacts').value() || [];
  }

  saveContact(contact) {
    // Find existing contact or create new one
    const existing = this.db.get('contacts').find({ id: contact.id }).value();
    const now = new Date().toISOString();

    const contactData = {
      ...contact,
      id: contact.id || Date.now().toString(),
      createdAt: contact.createdAt || now,
      updatedAt: now,
      status: contact.status || 'active',
      emailSent: contact.emailSent || 0,
      lastEmailDate: contact.lastEmailDate || null,
      followupsRemaining: contact.followupsRemaining || []
    };

    if (existing) {
      this.db.get('contacts').find({ id: contact.id }).assign(contactData).write();
    } else {
      this.db.get('contacts').push(contactData).write();
    }

    return contactData;
  }

  getContact(contactId) {
    return this.db.get('contacts').find({ id: contactId }).value();
  }

  updateContact(contactId, updates) {
    const contact = this.db.get('contacts').find({ id: contactId }).value();

    if (contact) {
      const updatedContact = {
        ...contact,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      this.db.get('contacts').find({ id: contactId }).assign(updatedContact).write();
      return updatedContact;
    }
    throw new Error('Contact not found');
  }

  deleteContact(contactId) {
    const contacts = this.db.get('contacts');
    const initialLength = contacts.size().value();
    contacts.remove({ id: contactId }).write();
    return contacts.size().value() < initialLength;
  }

  // Campaign management
  getAllCampaigns() {
    return this.db.get('campaigns').value() || [];
  }

  getCampaign(campaignId) {
    return this.db.get('campaigns').find({ id: campaignId }).value();
  }

  saveCampaign(campaign) {
    const existing = this.db.get('campaigns').find({ id: campaign.id }).value();
    const now = new Date().toISOString();

    const campaignData = {
      ...campaign,
      id: campaign.id || Date.now().toString(),
      createdAt: campaign.createdAt || now,
      updatedAt: now,
      status: campaign.status || 'draft',
      contacts: campaign.contacts || [],
      schedule: campaign.schedule || {
        startDate: now,
        frequency: 'daily',
        batchSize: 5,
        delayBetweenEmails: 30000,
        delayBetweenBatches: 300000
      },
      stats: campaign.stats || {
        sent: 0,
        opened: 0,
        clicked: 0,
        replied: 0
      }
    };

    if (existing) {
      this.db.get('campaigns').find({ id: campaign.id }).assign(campaignData).write();
    } else {
      this.db.get('campaigns').push(campaignData).write();
    }

    return campaignData;
  }

  deleteCampaign(campaignId) {
    const campaigns = this.db.get('campaigns');
    const initialLength = campaigns.size().value();
    campaigns.remove({ id: campaignId }).write();
    return campaigns.size().value() < initialLength;
  }

  // Settings management
  getSettings() {
    return this.db.get('settings').value() || {};
  }

  saveSettings(settings) {
    const currentSettings = this.db.get('settings').value() || {};
    this.db.set('settings', { ...currentSettings, ...settings }).write();
    return this.db.get('settings').value();
  }

  // Daily stats
  getDailyStats() {
    const today = new Date().toDateString();
    const stats = this.db.get('dailyStats').value();

    if (!stats || stats.date !== today) {
      const newStats = {
        date: today,
        sentToday: 0
      };
      this.db.set('dailyStats', newStats).write();
      return newStats;
    }

    return stats;
  }

  incrementDailySent() {
    const stats = this.getDailyStats();
    stats.sentToday++;
    this.db.set('dailyStats', stats).write();
    return stats;
  }

  canSendToday() {
    const stats = this.getDailyStats();
    const settings = this.getSettings();
    const dailyLimit = settings.emailLimits?.dailyLimit || 50;

    return stats.sentToday < dailyLimit;
  }

  // Email tracking
  trackEmailSent(contactId, campaignId, emailType = 'initial') {
    // Update contact
    const contact = this.db.get('contacts').find({ id: contactId }).value();
    if (contact) {
      this.db.get('contacts').find({ id: contactId }).assign({
        ...contact,
        emailSent: (contact.emailSent || 0) + 1,
        lastEmailDate: new Date().toISOString(),
        followupsRemaining: emailType === 'followup' ?
          contact.followupsRemaining.filter(f => f.type !== emailType) :
          contact.followupsRemaining
      }).write();
    }

    // Update campaign stats if provided
    if (campaignId) {
      const campaign = this.db.get('campaigns').find({ id: campaignId }).value();
      if (campaign) {
        this.db.get('campaigns').find({ id: campaignId }).assign({
          ...campaign,
          stats: {
            ...campaign.stats,
            sent: (campaign.stats.sent || 0) + 1
          }
        }).write();
      }
    }

    // Update daily stats
    this.incrementDailySent();
  }

  // Follow-up scheduling
  scheduleFollowup(contactId, followupData) {
    const contact = this.db.get('contacts').find({ id: contactId }).value();

    if (contact) {
      const followups = contact.followupsRemaining || [];
      followups.push({
        ...followupData,
        id: Date.now().toString(),
        scheduledFor: followupData.scheduledFor,
        status: 'scheduled'
      });

      this.db.get('contacts').find({ id: contactId }).assign({
        ...contact,
        followupsRemaining: followups
      }).write();

      return this.db.get('contacts').find({ id: contactId }).value();
    }

    throw new Error('Contact not found');
  }

  getPendingFollowups() {
    const now = new Date();
    const contacts = this.db.get('contacts').value() || [];

    return contacts.flatMap(contact =>
      (contact.followupsRemaining || [])
        .filter(f => f.status === 'scheduled' && new Date(f.scheduledFor) <= now)
        .map(f => ({
          contactId: contact.id,
          contact: contact,
          followup: f
        }))
    );
  }

  markFollowupSent(contactId, followupId) {
    const contact = this.db.get('contacts').find({ id: contactId }).value();

    if (contact && contact.followupsRemaining) {
      const followupIndex = contact.followupsRemaining.findIndex(f => f.id === followupId);

      if (followupIndex >= 0) {
        contact.followupsRemaining[followupIndex].status = 'sent';
        contact.followupsRemaining[followupIndex].sentAt = new Date().toISOString();

        this.db.get('contacts').find({ id: contactId }).assign(contact).write();
        return true;
      }
    }

    return false;
  }

  // Utility methods
  getStats() {
    const contacts = this.db.get('contacts').value() || [];
    const campaigns = this.db.get('campaigns').value() || [];
    const dailyStats = this.getDailyStats();

    return {
      totalContacts: contacts.length,
      activeContacts: contacts.filter(c => c.status === 'active').length,
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter(c => c.status === 'active').length,
      sentToday: dailyStats.sentToday,
      totalEmailsSent: contacts.reduce((sum, c) => sum + (c.emailSent || 0), 0)
    };
  }

  exportData() {
    return this.db.value();
  }

  importData(data) {
    this.db.assign(data).write();
    return true;
  }
}

module.exports = DatabaseService;
