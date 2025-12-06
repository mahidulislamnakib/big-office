/**
 * Email Service - Handles email sending with nodemailer
 * Supports SMTP configuration, template rendering, and queue management
 */

const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');
const path = require('path');

class EmailService {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'data', 'tenders.db');
    this.transporter = null;
    this.transporterReady = false;
    this.initPromise = this.initializeTransporter();
  }

  /**
   * Ensure transporter is ready
   */
  async ensureReady() {
    if (!this.transporterReady) {
      await this.initPromise;
    }
  }

  /**
   * Initialize nodemailer transporter
   * For development, uses test account (Ethereal Email)
   * For production, configure SMTP settings in environment variables
   */
  async initializeTransporter() {
    try {
      // Check if production SMTP credentials are available and valid
      if (process.env.SMTP_HOST && 
          process.env.SMTP_USER && 
          process.env.SMTP_PASS &&
          process.env.SMTP_USER !== 'your-email@gmail.com' && // Not placeholder
          process.env.SMTP_PASS !== 'your-app-password') { // Not placeholder
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
        console.log('✅ Email service initialized with production SMTP');
        this.transporterReady = true;
      } else {
        // Development mode - create test account
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransporter({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass
          }
        });
        console.log('✅ Email service initialized with test account (Ethereal)');
        console.log(`   Test account: ${testAccount.user}`);
        console.log(`   Preview URLs will be available in send results`);
        this.transporterReady = true;
      }
    } catch (error) {
      console.error('❌ Failed to initialize email transporter:', error.message);
      this.transporterReady = false;
    }
  }

  /**
   * Render email template with data
   * @param {string} template - HTML template with {{variables}}
   * @param {object} data - Data to replace in template
   * @returns {string} Rendered HTML
   */
  renderTemplate(template, data) {
    let rendered = template;
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, value || '');
    }
    return rendered;
  }

  /**
   * Get email template from database
   * @param {string} code - Template code (e.g., 'TENDER_DEADLINE')
   * @returns {object} Template object
   */
  getTemplate(code) {
    const db = new Database(this.dbPath);
    try {
      const template = db.prepare(`
        SELECT * FROM email_templates 
        WHERE code = ? AND is_active = 1
      `).get(code);
      return template;
    } finally {
      db.close();
    }
  }

  /**
   * Add email to queue
   * @param {object} emailData - Email details
   * @returns {number} Queue ID
   */
  addToQueue(emailData) {
    const db = new Database(this.dbPath);
    try {
      const {
        to_email,
        to_name,
        cc_emails,
        bcc_emails,
        subject,
        body_html,
        body_text,
        template_id,
        template_data,
        priority = 'normal',
        scheduled_at,
        created_by
      } = emailData;

      const result = db.prepare(`
        INSERT INTO email_queue (
          to_email, to_name, cc_emails, bcc_emails, subject, 
          body_html, body_text, template_id, template_data, 
          priority, scheduled_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        to_email,
        to_name,
        cc_emails ? JSON.stringify(cc_emails) : null,
        bcc_emails ? JSON.stringify(bcc_emails) : null,
        subject,
        body_html,
        body_text,
        template_id,
        template_data ? JSON.stringify(template_data) : null,
        priority,
        scheduled_at,
        created_by
      );

      return result.lastInsertRowid;
    } finally {
      db.close();
    }
  }

  /**
   * Send email using template
   * @param {string} templateCode - Template code
   * @param {object} data - Template data
   * @param {string} toEmail - Recipient email
   * @param {string} toName - Recipient name
   * @param {object} options - Additional options (cc, bcc, priority, etc.)
   * @returns {object} Send result
   */
  async sendTemplateEmail(templateCode, data, toEmail, toName = '', options = {}) {
    try {
      // Ensure transporter is ready
      await this.ensureReady();
      
      // Get template from database
      const template = this.getTemplate(templateCode);
      if (!template) {
        throw new Error(`Template ${templateCode} not found`);
      }

      // Render template
      const subject = this.renderTemplate(template.subject, data);
      const bodyHtml = this.renderTemplate(template.body_html, data);
      const bodyText = template.body_text ? this.renderTemplate(template.body_text, data) : '';

      // Add to queue first
      const queueId = this.addToQueue({
        to_email: toEmail,
        to_name: toName,
        cc_emails: options.cc,
        bcc_emails: options.bcc,
        subject,
        body_html: bodyHtml,
        body_text: bodyText,
        template_id: template.id,
        template_data: data,
        priority: options.priority || 'normal',
        scheduled_at: options.scheduled_at,
        created_by: options.created_by
      });

      // If not scheduled, send immediately
      if (!options.scheduled_at) {
        return await this.sendQueuedEmail(queueId);
      }

      return { success: true, queueId, status: 'scheduled' };
    } catch (error) {
      console.error('Error sending template email:', error);
      throw error;
    }
  }

  /**
   * Send queued email by ID
   * @param {number} queueId - Queue ID
   * @returns {object} Send result
   */
  async sendQueuedEmail(queueId) {
    // Ensure transporter is ready
    await this.ensureReady();
    
    const db = new Database(this.dbPath);
    
    try {
      // Get email from queue
      const email = db.prepare(`
        SELECT * FROM email_queue WHERE id = ? AND status = 'pending'
      `).get(queueId);

      if (!email) {
        throw new Error('Email not found in queue or already processed');
      }

      // Check if transporter is initialized
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      // Update status to sending
      db.prepare(`
        UPDATE email_queue 
        SET status = 'sending', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(queueId);

      // Check if transporter is initialized
      if (!this.transporter) {
        throw new Error('Email service not initialized. Please check SMTP configuration.');
      }

      // Prepare mail options
      const mailOptions = {
        from: process.env.SMTP_FROM || '"Big Office" <noreply@bigoffice.com>',
        to: email.to_name ? `"${email.to_name}" <${email.to_email}>` : email.to_email,
        subject: email.subject,
        html: email.body_html,
        text: email.body_text
      };

      // Add CC and BCC if available
      if (email.cc_emails) {
        mailOptions.cc = JSON.parse(email.cc_emails);
      }
      if (email.bcc_emails) {
        mailOptions.bcc = JSON.parse(email.bcc_emails);
      }

      // Send email
      const info = await this.transporter.sendMail(mailOptions);

      // Update queue status to sent
      db.prepare(`
        UPDATE email_queue 
        SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(queueId);

      // Log success
      db.prepare(`
        INSERT INTO email_logs (queue_id, to_email, subject, status, provider_response, sent_at)
        VALUES (?, ?, ?, 'sent', ?, CURRENT_TIMESTAMP)
      `).run(queueId, email.to_email, email.subject, info.messageId);

      // Get preview URL for development
      const previewUrl = nodemailer.getTestMessageUrl(info);

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: previewUrl || null,
        queueId
      };

    } catch (error) {
      // Update queue status to failed
      db.prepare(`
        UPDATE email_queue 
        SET status = 'failed', failed_at = CURRENT_TIMESTAMP, 
            error_message = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(error.message, queueId);

      // Log failure
      db.prepare(`
        INSERT INTO email_logs (queue_id, to_email, subject, status, error_message)
        SELECT id, to_email, subject, 'failed', ? FROM email_queue WHERE id = ?
      `).run(error.message, queueId);

      throw error;
    } finally {
      db.close();
    }
  }

  /**
   * Process pending emails in queue
   * @param {number} limit - Maximum number of emails to process
   * @returns {object} Processing results
   */
  async processPendingEmails(limit = 50) {
    const db = new Database(this.dbPath);
    
    try {
      // Get pending emails that are scheduled or ready to send
      const emails = db.prepare(`
        SELECT id FROM email_queue 
        WHERE status = 'pending' 
        AND attempts < max_attempts
        AND (scheduled_at IS NULL OR scheduled_at <= CURRENT_TIMESTAMP)
        ORDER BY priority DESC, created_at ASC
        LIMIT ?
      `).all(limit);

      const results = {
        total: emails.length,
        sent: 0,
        failed: 0,
        errors: []
      };

      for (const email of emails) {
        try {
          await this.sendQueuedEmail(email.id);
          results.sent++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            queueId: email.id,
            error: error.message
          });
        }
      }

      return results;
    } finally {
      db.close();
    }
  }

  /**
   * Get user email preferences
   * @param {number} userId - User ID
   * @returns {object} Email preferences
   */
  getUserPreferences(userId) {
    const db = new Database(this.dbPath);
    try {
      const prefs = db.prepare(`
        SELECT * FROM email_settings WHERE user_id = ?
      `).get(userId);
      return prefs;
    } finally {
      db.close();
    }
  }

  /**
   * Check if user has email notifications enabled for a category
   * @param {number} userId - User ID
   * @param {string} category - Email category (e.g., 'notification_emails')
   * @returns {boolean} Whether emails are enabled
   */
  isEmailEnabled(userId, category = 'notification_emails') {
    const prefs = this.getUserPreferences(userId);
    if (!prefs) return true; // Default to enabled if no preferences set
    return prefs[category] === 1;
  }

  /**
   * Send email to users based on notification type
   * @param {string} templateCode - Template code
   * @param {object} data - Template data
   * @param {array} userIds - Array of user IDs to notify
   * @param {string} category - Email category for preference checking
   * @returns {object} Send results
   */
  async sendNotificationEmails(templateCode, data, userIds, category = 'notification_emails') {
    const db = new Database(this.dbPath);
    
    try {
      // Get users with email enabled for this category
      const users = db.prepare(`
        SELECT u.id, u.email, u.full_name 
        FROM users u
        LEFT JOIN email_settings es ON es.user_id = u.id
        WHERE u.id IN (${userIds.map(() => '?').join(',')})
        AND u.email IS NOT NULL
        AND u.email != ''
        AND (es.${category} IS NULL OR es.${category} = 1)
      `).all(...userIds);

      const results = [];

      for (const user of users) {
        try {
          const result = await this.sendTemplateEmail(
            templateCode,
            data,
            user.email,
            user.full_name,
            { created_by: null }
          );
          results.push({ userId: user.id, success: true, ...result });
        } catch (error) {
          results.push({ userId: user.id, success: false, error: error.message });
        }
      }

      return results;
    } finally {
      db.close();
    }
  }
}

// Export singleton instance
module.exports = new EmailService();
