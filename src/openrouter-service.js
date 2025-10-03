const axios = require('axios');

class OpenRouterService {
  constructor() {
    this.baseURL = 'https://openrouter.ai/api/v1';
    this.apiKey = null;
    this.model = 'anthropic/claude-3-haiku'; // Default model, can be changed in settings
  }

  setCredentials(apiKey, model = 'anthropic/claude-3-haiku') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generatePersonalizedEmail(contactInfo, campaignSettings) {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    try {
      const prompt = this.buildEmailPrompt(contactInfo, campaignSettings);

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at writing personalized, professional cold emails that get responses. Write emails that are concise, personalized to the recipient, and provide value while clearly stating the purpose of your outreach.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://cold-email-service.app',
          'X-Title': 'Cold Email Service'
        },
        timeout: 30000
      });

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const generatedContent = response.data.choices[0].message.content;

        // Parse the response to separate subject and body
        const parsedEmail = this.parseGeneratedEmail(generatedContent);

        return {
          subject: parsedEmail.subject,
          body: parsedEmail.body,
          generatedAt: new Date().toISOString(),
          model: this.model,
          usage: response.data.usage
        };
      } else {
        throw new Error('Invalid response from OpenRouter API');
      }

    } catch (error) {
      console.error('Error generating email:', error.response?.data || error.message);

      if (error.response?.status === 401) {
        throw new Error('Invalid OpenRouter API key');
      } else if (error.response?.status === 429) {
        throw new Error('OpenRouter API rate limit exceeded');
      } else if (error.response?.status === 402) {
        throw new Error('OpenRouter API credits/quota exceeded');
      } else {
        throw new Error(`Failed to generate email: ${error.message}`);
      }
    }
  }

  buildEmailPrompt(contactInfo, campaignSettings) {
    const {
      fullName,
      headline,
      currentPosition,
      company,
      experience,
      skills,
      about,
      location
    } = contactInfo;

    const {
      yourName,
      yourPosition,
      yourCompany,
      yourValueProp,
      callToAction,
      emailTone = 'professional',
      emailLength = 'medium'
    } = campaignSettings;

    let prompt = `Write a personalized cold email for ${fullName}. `;

    if (headline) {
      prompt += `Their headline is: "${headline}". `;
    }

    if (currentPosition && company) {
      prompt += `They work as ${currentPosition} at ${company}. `;
    } else if (currentPosition) {
      prompt += `Their current position is: ${currentPosition}. `;
    } else if (company) {
      prompt += `They work at ${company}. `;
    }

    if (experience && experience.length > 0) {
      prompt += `\n\nTheir recent experience: `;
      experience.slice(0, 3).forEach(exp => {
        if (exp.title && exp.company) {
          prompt += `\n- ${exp.title} at ${exp.company}`;
          if (exp.duration) prompt += ` (${exp.duration})`;
        }
      });
    }

    if (skills && skills.length > 0) {
      prompt += `\n\nTheir key skills: ${skills.slice(0, 5).join(', ')}. `;
    }

    if (about) {
      prompt += `\n\nAbout them: ${about.slice(0, 200)}${about.length > 200 ? '...' : ''}`;
    }

    if (location) {
      prompt += `\n\nLocation: ${location}`;
    }

    prompt += '\n\nEmail writer information:';
    prompt += `\n- Your name: ${yourName}`;
    if (yourPosition) prompt += `\n- Your position: ${yourPosition}`;
    if (yourCompany) prompt += `\n- Your company: ${yourCompany}`;
    if (yourValueProp) prompt += `\n- Your value proposition: ${yourValueProp}`;
    if (callToAction) prompt += `\n- Desired action: ${callToAction}`;

    prompt += '\n\nEmail requirements:';
    prompt += `\n- Tone: ${emailTone}`;
    prompt += `\n- Length: ${emailLength} (short: 100-150 words, medium: 150-250 words, long: 250-400 words)`;
    prompt += '\n- Make it highly personalized - reference their specific background, experience, or skills';
    prompt += '\n- Show that you understand their work/role';
    prompt += '\n- Focus on how you can help them, not just what you do';
    prompt += '\n- Include a specific, actionable call-to-action';
    prompt += '\n- End with a clear next step';

    prompt += '\n\nOutput Format:';
    prompt += '\nSubject: [Subject Line]';
    prompt += '\n\n[Email Body]';

    prompt += '\n\nExamples of good personalization:';
    prompt += '\n- Reference their recent project, role, or company achievement';
    prompt += '\n- Mention a mutual connection, shared interest, or relevant skill';
    prompt += '\n- Connect your offering to a specific pain point they might have';
    prompt += '\n- Reference their career transition or industry expertise';

    return prompt;
  }

  parseGeneratedEmail(generatedContent) {
    // Try to parse the generated content to separate subject and body
    const lines = generatedContent.trim().split('\n');

    let subject = '';
    let body = '';

    // Look for subject line
    const subjectIndex = lines.findIndex(line => line.toLowerCase().startsWith('subject:'));

    if (subjectIndex >= 0) {
      // Extract subject
      subject = lines[subjectIndex].substring(8).trim();

      // Everything after subject line is the body
      body = lines.slice(subjectIndex + 1).join('\n').trim();
    } else {
      // If no clear subject line, assume first line is subject
      subject = lines[0].trim();
      body = lines.slice(1).join('\n').trim();
    }

    // Clean up the body (remove common AI artifacts)
    body = body.replace(/^Body:?\s*/i, '');
    body = body.replace(/^\n+/, ''); // Remove leading newlines

    return {
      subject: subject || 'Interest in Your Expertise',
      body: body || 'I would like to connect with you regarding potential opportunities.'
    };
  }

  async testConnection() {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    try {
      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: 'Say "Hello" in one word.'
          }
        ],
        max_tokens: 10
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        return { success: true, message: 'OpenRouter API connection successful' };
      } else {
        throw new Error('Invalid API response');
      }

    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Invalid API key');
      } else if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded');
      } else {
        throw new Error(`API test failed: ${error.message}`);
      }
    }
  }

  async getModels() {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    try {
      const response = await axios.get(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.data && response.data.data) {
        // Filter for good models for email writing
        const recommendedModels = [
          'anthropic/claude-3-haiku',
          'anthropic/claude-3-sonnet',
          'openai/gpt-4o-mini',
          'openai/gpt-4o',
          'meta-llama/llama-3.1-8b-instruct',
          'meta-llama/llama-3.1-70b-instruct',
          'google/gemini-flash-1.5',
          'google/gemini-pro-1.5'
        ];

        const availableModels = response.data.data
          .filter(model => recommendedModels.includes(model.id))
          .map(model => ({
            id: model.id,
            name: model.name,
            provider: model.id.split('/')[0],
            contextLength: model.context_length,
            pricing: model.pricing
          }));

        return availableModels;
      } else {
        return [];
      }

    } catch (error) {
      console.error('Error fetching models:', error.message);
      // Return default models if API call fails
      return [
        { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'anthropic' },
        { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'anthropic' },
        { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
        { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openai' }
      ];
    }
  }

  // Batch email generation for efficiency
  async generateEmailsBatch(contacts, campaignSettings, batchSize = 3) {
    const results = [];
    const batches = [];

    // Split contacts into batches
    for (let i = 0; i < contacts.length; i += batchSize) {
      batches.push(contacts.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(contact => {
        return this.generatePersonalizedEmail(contact, campaignSettings)
          .then(email => ({
            contactId: contact.id,
            email,
            success: true
          }))
          .catch(error => ({
            contactId: contact.id,
            error: error.message,
            success: false
          }));
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to respect rate limits
      if (batches.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  async generateFollowupEmail(originalEmail, contactResponse, campaignSettings) {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    try {
      let responseContext = '';
      if (contactResponse) {
        responseContext = `\nTheir response: "${contactResponse}"`;
      } else {
        responseContext = '\nNo response received from initial email.';
      }

      const prompt = `Write a follow-up email based on the following context:

Original email sent to ${campaignSettings.contactName}:
Subject: ${originalEmail.subject}
Body: ${originalEmail.body}

${responseContext}

Your information:
- Name: ${campaignSettings.yourName || 'N/A'}
- Position: ${campaignSettings.yourPosition || 'N/A'}
- Company: ${campaignSettings.yourCompany || 'N/A'}

Follow-up requirements:
- Reference the original email
- Acknowledge any response or lack thereof
- Provide additional value or information
- Keep it brief and professional
- Include a clear next step

Output Format:
Subject: [Subject Line]

[Email Body]`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'Write professional, concise follow-up emails that reference the original outreach and provide additional value.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.6
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://cold-email-service.app',
          'X-Title': 'Cold Email Service'
        },
        timeout: 20000
      });

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const generatedContent = response.data.choices[0].message.content;
        const parsedEmail = this.parseGeneratedEmail(generatedContent);

        return {
          subject: parsedEmail.subject,
          body: parsedEmail.body,
          generatedAt: new Date().toISOString(),
          model: this.model,
          usage: response.data.usage,
          type: 'followup'
        };
      } else {
        throw new Error('Invalid response from OpenRouter API');
      }

    } catch (error) {
      throw new Error(`Failed to generate follow-up email: ${error.message}`);
    }
  }
}

module.exports = OpenRouterService;
