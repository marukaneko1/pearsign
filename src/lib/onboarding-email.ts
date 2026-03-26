/**
 * Onboarding Email Service
 *
 * Sends welcome and onboarding emails after organization activation.
 */

import { sendEmail } from './email-service';

// ============== TYPES ==============

export interface OnboardingEmailData {
  recipientEmail: string;
  recipientName: string;
  organizationName: string;
  loginUrl: string;
  setupGuideUrl: string;
}

// ============== EMAIL TEMPLATES ==============

/**
 * Generate the welcome email HTML for new organization owners
 */
function generateWelcomeEmailHtml(data: OnboardingEmailData): string {
  const { recipientName, organizationName, loginUrl, setupGuideUrl } = data;
  const firstName = recipientName.split(' ')[0] || 'there';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to PearSign!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2464ea 0%, #1e40af 100%); padding: 40px 32px; text-align: center;">
              <div style="width: 72px; height: 72px; background-color: rgba(255,255,255,0.2); border-radius: 20px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                <span style="color: white; font-size: 36px; font-weight: bold;">P</span>
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Welcome to PearSign!</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 16px;">
                Your organization <strong>${organizationName}</strong> is ready
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <p style="color: #374151; font-size: 16px; line-height: 26px; margin: 0 0 24px 0;">
                Hi ${firstName},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 26px; margin: 0 0 24px 0;">
                Congratulations! Your organization <strong>${organizationName}</strong> has been activated on PearSign. You're now ready to start sending documents for signature.
              </p>

              <!-- Quick Start Steps -->
              <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 12px; padding: 24px; margin: 24px 0;">
                <h3 style="color: #0369a1; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">
                  🚀 Quick Start Guide
                </h3>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0;">
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width: 28px; vertical-align: top;">
                            <div style="width: 24px; height: 24px; background-color: #2464ea; border-radius: 50%; color: white; font-size: 12px; font-weight: bold; text-align: center; line-height: 24px;">1</div>
                          </td>
                          <td style="padding-left: 12px;">
                            <p style="color: #374151; margin: 0; font-size: 14px;">
                              <strong>Connect your email service</strong><br>
                              <span style="color: #6b7280;">Set up SendGrid to send signer notifications</span>
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width: 28px; vertical-align: top;">
                            <div style="width: 24px; height: 24px; background-color: #2464ea; border-radius: 50%; color: white; font-size: 12px; font-weight: bold; text-align: center; line-height: 24px;">2</div>
                          </td>
                          <td style="padding-left: 12px;">
                            <p style="color: #374151; margin: 0; font-size: 14px;">
                              <strong>Add your branding</strong><br>
                              <span style="color: #6b7280;">Upload your logo and set brand colors</span>
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width: 28px; vertical-align: top;">
                            <div style="width: 24px; height: 24px; background-color: #2464ea; border-radius: 50%; color: white; font-size: 12px; font-weight: bold; text-align: center; line-height: 24px;">3</div>
                          </td>
                          <td style="padding-left: 12px;">
                            <p style="color: #374151; margin: 0; font-size: 14px;">
                              <strong>Create your first template</strong><br>
                              <span style="color: #6b7280;">Set up reusable documents with signature fields</span>
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width: 28px; vertical-align: top;">
                            <div style="width: 24px; height: 24px; background-color: #2464ea; border-radius: 50%; color: white; font-size: 12px; font-weight: bold; text-align: center; line-height: 24px;">4</div>
                          </td>
                          <td style="padding-left: 12px;">
                            <p style="color: #374151; margin: 0; font-size: 14px;">
                              <strong>Send your first document</strong><br>
                              <span style="color: #6b7280;">Get signatures in minutes, not days</span>
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- CTA Buttons -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #2464ea 0%, #1e40af 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-weight: 600; font-size: 16px; margin-right: 12px;">
                  Go to Dashboard
                </a>
                <a href="${setupGuideUrl}" style="display: inline-block; background-color: #f3f4f6; color: #374151; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-weight: 600; font-size: 16px;">
                  Setup Guide
                </a>
              </div>

              <!-- Features -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 24px;">
                <tr>
                  <td width="33%" style="text-align: center; padding: 12px;">
                    <div style="font-size: 24px; margin-bottom: 8px;">⚡</div>
                    <p style="color: #374151; font-size: 13px; margin: 0; font-weight: 600;">Lightning Fast</p>
                    <p style="color: #6b7280; font-size: 12px; margin: 4px 0 0 0;">Get signed in minutes</p>
                  </td>
                  <td width="33%" style="text-align: center; padding: 12px;">
                    <div style="font-size: 24px; margin-bottom: 8px;">🔒</div>
                    <p style="color: #374151; font-size: 13px; margin: 0; font-weight: 600;">Bank-Level Security</p>
                    <p style="color: #6b7280; font-size: 12px; margin: 4px 0 0 0;">256-bit encryption</p>
                  </td>
                  <td width="33%" style="text-align: center; padding: 12px;">
                    <div style="font-size: 24px; margin-bottom: 8px;">📊</div>
                    <p style="color: #374151; font-size: 13px; margin: 0; font-weight: 600;">Real-time Tracking</p>
                    <p style="color: #6b7280; font-size: 12px; margin: 4px 0 0 0;">Know when it's signed</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 13px; margin: 0 0 8px 0;">
                Questions? Reply to this email or visit our <a href="https://docs.pearsign.com" style="color: #2464ea; text-decoration: none;">Help Center</a>
              </p>
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} PearSign. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Generate plain text version of welcome email
 */
function generateWelcomeEmailText(data: OnboardingEmailData): string {
  const { recipientName, organizationName, loginUrl, setupGuideUrl } = data;
  const firstName = recipientName.split(' ')[0] || 'there';

  return `
Welcome to PearSign!

Hi ${firstName},

Congratulations! Your organization "${organizationName}" has been activated on PearSign. You're now ready to start sending documents for signature.

QUICK START GUIDE
=================

1. Connect your email service
   Set up SendGrid to send signer notifications

2. Add your branding
   Upload your logo and set brand colors

3. Create your first template
   Set up reusable documents with signature fields

4. Send your first document
   Get signatures in minutes, not days

GET STARTED
===========

Dashboard: ${loginUrl}
Setup Guide: ${setupGuideUrl}

FEATURES
========

⚡ Lightning Fast - Get signed in minutes
🔒 Bank-Level Security - 256-bit encryption
📊 Real-time Tracking - Know when it's signed

Questions? Reply to this email or visit our Help Center at https://docs.pearsign.com

© ${new Date().getFullYear()} PearSign. All rights reserved.
`;
}

// ============== EMAIL SENDING ==============

/**
 * Send welcome onboarding email after organization activation
 */
export async function sendOnboardingWelcomeEmail(data: OnboardingEmailData): Promise<boolean> {
  try {
    const htmlContent = generateWelcomeEmailHtml(data);
    const textContent = generateWelcomeEmailText(data);

    await sendEmail({
      to: data.recipientEmail,
      subject: `Welcome to PearSign! Your organization "${data.organizationName}" is ready`,
      htmlContent,
      textContent,
    });

    console.log('[OnboardingEmail] Welcome email sent to:', data.recipientEmail);
    return true;
  } catch (error) {
    console.error('[OnboardingEmail] Failed to send welcome email:', error);
    return false;
  }
}

/**
 * Send getting started tips email (can be sent a day after activation)
 */
export async function sendGettingStartedTipsEmail(data: {
  recipientEmail: string;
  recipientName: string;
  organizationName: string;
  docsUrl: string;
}): Promise<boolean> {
  try {
    const firstName = data.recipientName.split(' ')[0] || 'there';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px 32px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="width: 56px; height: 56px; background: linear-gradient(135deg, #2464ea 0%, #1e40af 100%); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-size: 28px; font-weight: bold;">P</span>
                </div>
              </div>

              <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 22px; text-align: center;">
                Tips to Get the Most Out of PearSign
              </h2>

              <p style="color: #374151; font-size: 15px; line-height: 24px; margin: 0 0 24px 0;">
                Hi ${firstName}, here are some tips to help you become a PearSign pro:
              </p>

              <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h4 style="color: #111827; margin: 0 0 12px 0; font-size: 15px;">💡 Pro Tip #1: Use Templates</h4>
                <p style="color: #6b7280; font-size: 14px; margin: 0;">
                  Create templates for documents you send frequently. Save hours by reusing them with one click.
                </p>
              </div>

              <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h4 style="color: #111827; margin: 0 0 12px 0; font-size: 15px;">💡 Pro Tip #2: Enable Reminders</h4>
                <p style="color: #6b7280; font-size: 14px; margin: 0;">
                  Turn on automatic reminders to nudge signers who haven't completed their documents.
                </p>
              </div>

              <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h4 style="color: #111827; margin: 0 0 12px 0; font-size: 15px;">💡 Pro Tip #3: Track Everything</h4>
                <p style="color: #6b7280; font-size: 14px; margin: 0;">
                  Check the Activity page to see real-time updates on all your documents.
                </p>
              </div>

              <div style="text-align: center; margin-top: 24px;">
                <a href="${data.docsUrl}" style="display: inline-block; background: linear-gradient(135deg, #2464ea 0%, #1e40af 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  Read Full Documentation
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} PearSign. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    await sendEmail({
      to: data.recipientEmail,
      subject: 'Tips to Get the Most Out of PearSign',
      htmlContent,
      textContent: `Hi ${firstName}, here are some tips to help you become a PearSign pro...`,
    });

    console.log('[OnboardingEmail] Tips email sent to:', data.recipientEmail);
    return true;
  } catch (error) {
    console.error('[OnboardingEmail] Failed to send tips email:', error);
    return false;
  }
}
