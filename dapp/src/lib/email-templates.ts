export function createVerificationEmailTemplate(verificationCode: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email - Hyppie</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f8fafc;
            }
            .container {
                background: white;
                border-radius: 12px;
                padding: 40px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .logo {
                font-size: 28px;
                font-weight: bold;
                color: #8b5cf6;
                margin-bottom: 8px;
            }
            .title {
                font-size: 24px;
                font-weight: bold;
                color: #1f2937;
                margin-bottom: 8px;
            }
            .subtitle {
                color: #6b7280;
                font-size: 16px;
            }
            .verification-code {
                background: linear-gradient(135deg, #8b5cf6, #06b6d4);
                color: white;
                padding: 20px;
                border-radius: 8px;
                text-align: center;
                margin: 30px 0;
            }
            .code {
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 4px;
                margin-bottom: 8px;
            }
            .code-subtitle {
                font-size: 14px;
                opacity: 0.9;
            }
            .instructions {
                background: #f1f5f9;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
            }
            .instructions h3 {
                margin-top: 0;
                color: #1f2937;
                font-size: 18px;
            }
            .instructions ol {
                margin: 0;
                padding-left: 20px;
            }
            .instructions li {
                margin-bottom: 8px;
                color: #4b5563;
            }
            .warning {
                background: #fef3c7;
                border: 1px solid #f59e0b;
                border-radius: 6px;
                padding: 16px;
                margin: 20px 0;
            }
            .warning-text {
                color: #92400e;
                font-size: 14px;
                margin: 0;
            }
            .footer {
                text-align: center;
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
                color: #6b7280;
                font-size: 14px;
            }
            .footer a {
                color: #8b5cf6;
                text-decoration: none;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">🎯 HYPPIE</div>
                <h1 class="title">Verify Your Email</h1>
                <p class="subtitle">Complete your quest by verifying your email address</p>
            </div>

            <div class="verification-code">
                <div class="code">${verificationCode}</div>
                <div class="code-subtitle">Your 6-digit verification code</div>
            </div>

            <div class="instructions">
                <h3>How to verify:</h3>
                <ol>
                    <li>Copy the 6-digit code above</li>
                    <li>Return to the Hyppie quest page</li>
                    <li>Paste the code in the verification field</li>
                    <li>Click "Verify" to complete your quest!</li>
                </ol>
            </div>

            <div class="warning">
                <p class="warning-text">
                    ⚠️ This code expires in 10 minutes. If you didn't request this verification, you can safely ignore this email.
                </p>
            </div>

            <div class="footer">
                <p>
                    This email was sent by <a href="https://hyppie.com">Hyppie</a><br>
                    Questions? Contact us at support@hyppie.com
                </p>
            </div>
        </div>
    </body>
    </html>
  `;
}

export function createVerificationEmailSubject(): string {
  return '🎯 Your Hyppie Email Verification Code';
}
