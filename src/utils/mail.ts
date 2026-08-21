interface Props{
    firstName: string,
        code: string,
    }
export default function emailTemplate({ firstName, code }: Props) {
    const date = new Date().getFullYear
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Atrixia - Email Verification</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: #1E3A8A;
            background-color: #F0F9FF;
        }

        .container {
            margin: 0 auto;
            background-color: #FFFFFF;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        /* Header */
        .header {
           padding: 16px;
          margin:0 16px;
        }

        .header-logo {
            display: inline-flex;
            align-items: center;
            gap: 2px;
            margin-bottom: px;
        }

 

        .header h1 {
            font-size: 40px;
            font-weight: 700;
            margin: 0;
        }

        .header p {
            font-size: 60px;
            opacity: 0.95;
   
        }

        /* Content */
        .content {
            padding: 40px 30px;
        }

        .greeting {
            font-size: 16px;
            margin-bottom: 24px;
            color: #1E3A8A;
        }

        .greeting strong {
            color: #14B8A6;
        }

        .message {
            font-size: 14px;
            line-height: 1.8;
            margin-bottom: 32px;
            color: #475569;
        }

        /* Verification Code Box */
        .code-container {
            background: linear-gradient(135deg, #DBEAFE 0%, #E0F2FE 100%);
            border: 2px solid #06B6D4;
            border-radius: 12px;
            padding: 32px;
            text-align: center;
            margin-bottom: 32px;
        }

        .code-label {
            font-size: 12px;
            font-weight: 600;
            color: #0369A1;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 12px;
            display: block;
        }

        .code {
            font-size: 48px;
            font-weight: 800;
            letter-spacing: 8px;
            color: #1E3A8A;
            font-family: 'Courier New', monospace;
            word-break: break-all;
        }

        .code-expires {
            font-size: 12px;
            color: #64748B;
            margin-top: 12px;
        }

        /* Instructions */
        .instructions {
            background-color: #F8FAFC;
            
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 24px;
        }

        .instructions h3 {
            font-size: 14px;
            color: #1E3A8A;
            margin-bottom: 8px;
            font-weight: 600;
        }

        .instructions ol {
            margin-left: 20px;
            font-size: 13px;
            color: #475569;
        }

        .instructions li {
            margin-bottom: 8px;
            line-height: 1.6;
        }


        /* Safety Note */
        .safety-note {
            
          
            padding: 14px;
            margin-bottom: 24px;
            
        }

        .safety-note p {
            font-size: 12px;
            color: #92400E;
            margin: 0;
        }

        .safety-note strong {
            color: #B45309;
        }

        /* Footer */
        .footer {
            background-color: #F8FAFC;
            border-top: 1px solid #E2E8F0;
            padding: 24px 30px;
            text-align: center;
            font-size: 12px;
            color: #64748B;
        }

        .footer-links {
            margin-bottom: 12px;
        }

        .footer-links a {
            color: #14B8A6;
            text-decoration: none;
            margin: 0 12px;
        }

        .footer-links a:hover {
            text-decoration: underline;
        }

        .footer-logo {
            margin-bottom: 12px;
        }

        .footer-logo strong {
            color: #1E3A8A;
        }

        .footer-logo span {
            color: #14B8A6;
        }

        /* Divider */
        .divider {
            height: 1px;
            background-color: #E2E8F0;
            margin: 24px 0;
        }

        /* Responsive */
        @media (max-width: 600px) {
            .container {
                border-radius: 0;
            }

            .header {
                padding: 30px 16px;
            }

            .header h1 {
                font-size: 24px;
            }

            .content {
                padding: 24px 16px;
            }

            .code {
                font-size: 36px;
                letter-spacing: 6px;
            }

            .code-container {
                padding: 24px;
            }

            .footer {
                padding: 16px;
                font-size: 11px;
            }

            .footer-links a {
                display: block;
                margin: 6px 0;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="header-logo">

                <h1>Vyrdly</h1>
            </div>
            <p>Verify Your Email</p>
        </div>

        <!-- Content -->
        <div class="content">
            <!-- Greeting -->
            <div class="greeting">
                Hi <strong>${firstName}</strong>,
            </div>

            <!-- Message -->
            <div class="message">
                Welcome to Vyrdly! To complete your email verification and start studying smarter, please use the verification code below.
            </div>

            <!-- Verification Code -->
            <div class="code-container">
                <span class="code-label">Your Verification Code</span>
                <div class="code">${code}</div>
                <div class="code-expires">This code expires in 10 minutes</div>
            </div>

            <!-- Instructions -->
            <div class="instructions">
                <h3>How to Verify Your Email:</h3>
                <ol>
                    <li>Go back to the Vrydly app or website</li>
                    <li>Enter the 6-digit code above in the verification field</li>
                    <li>Click "Verify" and you're all set!</li>
                    <li>Start Your smart group study</li>
                </ol>
            </div>

            <!-- Safety Note -->
            <div class="safety-note">
                <p><strong>Security Tip:</strong> Never share this code with anyone. Vyrdly staff will never ask for your verification code.</p>
            </div>

          

            <div class="divider"></div>

            <!-- Additional Info -->
            <div class="message" style="font-size: 12px;">
                <strong>Questions?</strong> We're here to help! If you have any trouble verifying your email, please reply to this email or contact our support team at support@vyrdly.com
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <div class="footer-logo">
                <strong>Vyrdly</strong> <span>×</span> study Smarter. Ace AAA's.
            </div>
            <div class="footer-links">
                <a href="{{APP_URL}}/help">Help Center</a>
                <a href="{{APP_URL}}/privacy">Privacy Policy</a>
                <a href="{{APP_URL}}/terms">Terms of Service</a>
            </div>
        <p>© ${date} Vyrdly. All rights reserved.</p>
            <p style="margin-top: 8px; font-size: 11px; color: #94A3B8;">
                You received this email because you signed up for Vrydly. 
                <a href="{{APP_URL}}/unsubscribe" style="color: #14B8A6; text-decoration: none;">Unsubscribe</a>
            </p>
        </div>
    </div>
</body>
</html>`;
}