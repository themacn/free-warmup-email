const puppeteer = require('puppeteer');

class LinkedInScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initializeBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: false, // Run non-headless to see the browser and handle any login requirements
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process', // <- this one doesn't work in Windows
          '--disable-gpu'
        ]
      });

      this.page = await this.browser.newPage();

      // Set user agent to avoid detection
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      // Set viewport
      await this.page.setViewport({ width: 1280, height: 800 });
    }
  }

  async login(credentials) {
    try {
      await this.initializeBrowser();

      console.log('Navigating to LinkedIn login page...');
      await this.page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle2' });

      // Wait for login form
      await this.page.waitForSelector('#username', { timeout: 10000 });

      console.log('Entering credentials...');
      await this.page.type('#username', credentials.email);
      await this.page.type('#password', credentials.password);

      console.log('Clicking login button...');
      await this.page.click('[type="submit"]');

      // Wait for successful login or 2FA
      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

      // Check if login was successful
      const currentUrl = this.page.url();
      if (currentUrl.includes('linkedin.com/feed') || currentUrl.includes('linkedin.com/mynetwork')) {
        console.log('Login successful!');
        return true;
      } else if (currentUrl.includes('checkpoint') || currentUrl.includes('authwall')) {
        throw new Error('LinkedIn authentication required. Please complete the login process manually.');
      } else {
        throw new Error('Login failed. Please check your credentials.');
      }

    } catch (error) {
      console.error('Login error:', error.message);
      throw error;
    }
  }

  async isLoggedIn() {
    try {
      if (!this.page) return false;

      const currentUrl = this.page.url();
      return currentUrl.includes('linkedin.com/feed') || currentUrl.includes('linkedin.com/in/') || currentUrl.includes('linkedin.com/company/');
    } catch (error) {
      return false;
    }
  }

  async scrapeProfile(profileUrl) {
    try {
      await this.initializeBrowser();

      // If not logged in, prompt for login
      if (!await this.isLoggedIn()) {
        throw new Error('Please log in to LinkedIn first in the browser window.');
      }

      console.log('Navigating to profile:', profileUrl);
      await this.page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for profile to load
      await this.page.waitForSelector('.pv-top-card', { timeout: 15000 });

      // Extract profile information
      const profileData = await this.page.evaluate(() => {
        const data = {};

        // Name
        const nameElement = document.querySelector('.pv-top-card .text-heading-xlarge');
        data.name = nameElement ? nameElement.textContent.trim() : '';

        // Headline
        const headlineElement = document.querySelector('.pv-top-card .text-body-medium');
        data.headline = headlineElement ? headlineElement.textContent.trim() : '';

        // Location
        const locationElements = document.querySelectorAll('.pv-top-card .text-body-small');
        if (locationElements.length > 0) {
          const locationText = Array.from(locationElements).map(el => el.textContent.trim());
          data.location = locationText.find(text =>
            text.includes('Greater') || text.includes('Area') || text.includes(',') || /[A-Za-z]/.test(text)
          ) || '';
        }

        // Current Position
        const positionElements = document.querySelectorAll('.pv-top-card .pv-text-details__right-panel .text-body-medium');
        data.currentPosition = positionElements.length > 0 ? positionElements[0].textContent.trim() : '';

        // Company
        const companyElements = document.querySelectorAll('.pv-top-card .pv-text-details__right-panel .pv-text-details__separator .text-body-small');
        data.company = companyElements.length > 0 ? companyElements[0].textContent.trim() : '';

        // About section
        const aboutElement = document.querySelector('.pv-about__summary-text .pv-text-details__left-panel .text-body-medium');
        data.about = aboutElement ? aboutElement.textContent.trim() : '';

        // Experience
        const experience = [];
        const experienceSections = document.querySelectorAll('.pv-profile-section.experience-section .pv-entity__summary-info');
        experienceSections.forEach((section, index) => {
          if (index < 3) { // Limit to first 3 experiences
            const expData = {};

            const titleElement = section.querySelector('.pv-entity__summary-info-header .pv-entity__secondary-title');
            expData.title = titleElement ? titleElement.textContent.trim() : '';

            const companyElement = section.querySelector('.pv-entity__summary-info-header .pv-entity__secondary-title');
            expData.company = companyElement ? companyElement.parentElement.querySelector('a')?.textContent.trim() || '' : '';

            const dateElement = section.querySelector('.pv-entity__summary-info .pv-entity__date-range span');
            if (dateElement) {
              const dateRange = Array.from(dateElement.childNodes).filter(node =>
                node.nodeType === Node.TEXT_NODE && node.textContent.trim()
              ).map(node => node.textContent.trim()).join(' ');
              expData.duration = dateRange;
            }

            experience.push(expData);
          }
        });
        data.experience = experience;

        // Education
        const education = [];
        const educationSections = document.querySelectorAll('.pv-profile-section.education-section .pv-entity__summary-info');
        educationSections.forEach((section, index) => {
          if (index < 2) { // Limit to first 2 education entries
            const eduData = {};

            const schoolElement = section.querySelector('.pv-entity__summary-info-header .pv-entity__school-name a');
            eduData.school = schoolElement ? schoolElement.textContent.trim() : '';

            const degreeElement = section.querySelector('.pv-entity__summary-info .pv-entity__degree-name span');
            eduData.degree = degreeElement ? degreeElement.textContent.trim() : '';

            education.push(eduData);
          }
        });
        data.education = education;

        // Skills
        const skills = [];
        const skillElements = document.querySelectorAll('.pv-skill-category-entity__name');
        skillElements.forEach((skill, index) => {
          if (index < 10) { // Limit to first 10 skills
            skills.push(skill.textContent.trim());
          }
        });
        data.skills = skills;

        // Contact info - try to extract from profile
        const contactElement = document.querySelector('.pv-contact-info__contact-type');
        if (contactElement) {
          const contactLink = contactElement.querySelector('a');
          if (contactLink && contactLink.href.includes('mailto:')) {
            data.email = contactLink.href.replace('mailto:', '');
          }
        }

        return data;
      });

      console.log('Profile data extracted:', profileData.name);

      // Construct full profile data
      const contactInfo = {
        linkedinUrl: profileUrl,
        fullName: profileData.name,
        headline: profileData.headline,
        location: profileData.location,
        currentPosition: profileData.currentPosition,
        company: profileData.company,
        about: profileData.about,
        experience: profileData.experience,
        education: profileData.education,
        skills: profileData.skills,
        email: profileData.email || '',
        scrapedAt: new Date().toISOString()
      };

      return contactInfo;

    } catch (error) {
      console.error('Error scraping profile:', error.message);
      throw new Error(`Failed to scrape LinkedIn profile: ${error.message}`);
    }
  }

  async scrapeMultipleProfiles(profileUrls, delayBetweenProfiles = 2000) {
    const results = [];

    for (const url of profileUrls) {
      try {
        console.log(`Scraping profile: ${url}`);
        const profileData = await this.scrapeProfile(url);
        results.push(profileData);

        // Add delay between profiles to avoid rate limiting
        if (delayBetweenProfiles > 0) {
          console.log(`Waiting ${delayBetweenProfiles/1000} seconds before next profile...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenProfiles));
        }

      } catch (error) {
        console.error(`Failed to scrape ${url}:`, error.message);
        // Continue with other profiles even if one fails
        results.push({
          linkedinUrl: url,
          error: error.message,
          fullName: 'Scraping failed',
          scrapedAt: new Date().toISOString()
        });
      }
    }

    return results;
  }

  async searchPeople(query, maxResults = 10) {
    try {
      await this.initializeBrowser();

      if (!await this.isLoggedIn()) {
        throw new Error('Please log in to LinkedIn first.');
      }

      console.log('Performing LinkedIn people search...');

      // Construct search URL
      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodedQuery}`;

      await this.page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for search results to load
      await this.page.waitForSelector('.search-result__info', { timeout: 15000 });

      // Extract profile URLs from search results
      const profileUrls = await this.page.evaluate((maxResults) => {
        const results = [];
        const resultElements = document.querySelectorAll('.search-result__result-link');

        for (let i = 0; i < Math.min(resultElements.length, maxResults); i++) {
          const href = resultElements[i].href;
          if (href && href.includes('linkedin.com/in/')) {
            results.push(href);
          }
        }

        return results;
      }, maxResults);

      console.log(`Found ${profileUrls.length} profiles for query: ${query}`);

      // Add delay before scraping individual profiles
      await new Promise(resolve => setTimeout(resolve, 1000));

      return profileUrls;

    } catch (error) {
      console.error('Error during LinkedIn search:', error.message);
      throw new Error(`LinkedIn search failed: ${error.message}`);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  // Utility method to check if we need to handle CAPTCHA or other interruptions
  async waitForManualIntervention(timeout = 300000) { // 5 minutes timeout
    console.log('Waiting for manual intervention...');
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        try {
          const isLoggedIn = await this.isLoggedIn();
          if (isLoggedIn) {
            clearInterval(checkInterval);
            resolve(true);
          }
        } catch (error) {
          // Continue checking
        }
      }, 5000); // Check every 5 seconds

      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Manual intervention timeout'));
      }, timeout);
    });
  }
}

module.exports = LinkedInScraper;
