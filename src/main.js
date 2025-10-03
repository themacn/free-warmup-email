const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const DatabaseService = require('./database-service');
const LinkedInScraper = require('./linkedin-scraper');
const EmailService = require('./email-service');
const OpenRouterService = require('./openrouter-service');

let mainWindow;
let databaseService;
let linkedinScraper;
let emailService;
let openrouterService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: true
    },
    icon: path.join(__dirname, '..', 'jotchats-logo.jpg'),
    titleBarStyle: 'hiddenInset',
    title: 'Cold Email Service'
  });

  // Set Content Security Policy for security
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
          "font-src 'self' data:; " +
          "img-src 'self' data: https:; " +
          "connect-src 'self' https:; " +
          "media-src 'self'; " +
          "object-src 'none'; " +
          "frame-src 'none'; " +
          "base-uri 'self'; " +
          "form-action 'self';"
        ]
      }
    });
  });

  mainWindow.loadFile(path.join(__dirname, '../views/index.html'));

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Initialize services
  databaseService = new DatabaseService();
  linkedinScraper = new LinkedInScraper();
  emailService = new EmailService(databaseService);
  openrouterService = new OpenRouterService();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers for communication with renderer
ipcMain.handle('get-contacts', async () => {
  return databaseService.getAllContacts();
});

ipcMain.handle('save-contact', async (event, contact) => {
  return databaseService.saveContact(contact);
});

ipcMain.handle('delete-contact', async (event, contactId) => {
  return databaseService.deleteContact(contactId);
});

ipcMain.handle('scrape-linkedin', async (event, profileUrl) => {
  try {
    const contactInfo = await linkedinScraper.scrapeProfile(profileUrl);
    return contactInfo;
  } catch (error) {
    throw new Error(`LinkedIn scraping failed: ${error.message}`);
  }
});

ipcMain.handle('generate-email', async (event, contactInfo, campaignSettings) => {
  try {
    const personalizedEmail = await openrouterService.generatePersonalizedEmail(contactInfo, campaignSettings);
    return personalizedEmail;
  } catch (error) {
    throw new Error(`Email generation failed: ${error.message}`);
  }
});

ipcMain.handle('send-email', async (event, emailData) => {
  try {
    await emailService.sendEmail(emailData);
    return { success: true };
  } catch (error) {
    throw new Error(`Email sending failed: ${error.message}`);
  }
});

ipcMain.handle('get-campaigns', async () => {
  return databaseService.getAllCampaigns();
});

ipcMain.handle('save-campaign', async (event, campaign) => {
  return databaseService.saveCampaign(campaign);
});

ipcMain.handle('start-campaign', async (event, campaignId) => {
  return emailService.startCampaign(campaignId);
});

ipcMain.handle('stop-campaign', async (event, campaignId) => {
  return emailService.stopCampaign(campaignId);
});

ipcMain.handle('get-settings', async () => {
  return databaseService.getSettings();
});

ipcMain.handle('save-settings', async (event, settings) => {
  return databaseService.saveSettings(settings);
});

ipcMain.handle('get-stats', async () => {
  return databaseService.getStats();
});

ipcMain.handle('show-message-box', async (event, options) => {
  return dialog.showMessageBox(mainWindow, options);
});

ipcMain.handle('show-error-box', async (event, title, content) => {
  return dialog.showErrorBox(title, content);
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  return dialog.showSaveDialog(mainWindow, options);
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  return dialog.showOpenDialog(mainWindow, options);
});
