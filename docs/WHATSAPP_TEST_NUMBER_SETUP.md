# WhatsApp Test Number – Step-by-Step Integration

Use this guide to connect your Meta test number to the CRM and send/receive messages for App Review.

---

## Prerequisites

- Meta app with WhatsApp product added
- Test number from Meta (WhatsApp → API Setup)
- CRM deployed at `https://crm28.asg.ge`

---

## Step 1: Add Your Phone to Meta’s “To” List

With a test number you can send messages to at most **5** phone numbers.

1. Go to [developers.facebook.com](https://developers.facebook.com) → your app.
2. Open **WhatsApp** → **API Setup**.
3. Find the **“To”** section (phone numbers you can message).
4. Click **Add phone number**.
5. Enter your phone number in international format (e.g. `995555123456` or `15551234567`).
6. Complete verification (SMS or voice call).

---

## Step 2: Get Credentials from Meta

1. In **WhatsApp** → **API Setup**, note:
   - **Phone number ID** (long numeric ID, not the phone number).
   - **Access token** (click **Generate** for a temporary token).
2. In **Settings** → **Basic**, copy the **App secret**.
3. In **WhatsApp** → **Configuration** → **Webhook**, set:
   - **Callback URL**: `https://api-crm28.asg.ge/public/clientchats/webhook/whatsapp`
   - **Verify token**: any secret string (e.g. `crm28-wa-verify-2024`).
4. Click **Subscribe** for the **messages** webhook field.

---

## Step 3: Configure the CRM

1. Go to **https://crm28.asg.ge** → **Admin** → **Client Chats Configuration**.
2. Open the **WhatsApp** section.
3. Enter:
   - **Phone Number ID**: from Step 2 (e.g. `3847293847293847`).
   - **Access Token**: from Step 2.
   - **Verify Token**: same as in Meta.
   - **App Secret**: from Meta Settings.
4. Click **Save**.
5. Click **Refresh status** – it should show **Connected**.

---

## Step 4: Create a Test Conversation

Because the app is unpublished, real inbound messages are not delivered. Use the test conversation flow:

1. In **Admin** → **Client Chats Configuration** → **WhatsApp**, find the **“Test conversation (for App Review)”** section.
2. Enter your phone number (e.g. `995555123456`), without `+` if you prefer.
3. Click **Create test conversation**.

---

## Step 5: Send a Reply from the CRM

1. Go to **Client Chats** in the left menu.
2. Find the conversation for your phone number.
3. Type a message (e.g. `Hello from CRM!`) and click **Send**.

---

## Step 6: Check WhatsApp

1. Open WhatsApp on your phone.
2. You should see the message you sent from the CRM.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Not connected** | Check Phone Number ID (not the phone number itself), Access Token, and App Secret. |
| **Create test conversation fails** | Ensure WhatsApp config is saved and status is Connected. |
| **Message not received on phone** | Ensure your number is in Meta’s “To” list (up to 5 numbers for the test number). |
| **Access token expired** | Temporary tokens expire in 24 hours. Generate a new one or use a system user token. |

---

## After It Works: Recording the App Review Video

1. Record a screencast showing:
   - WhatsApp config in the CRM (phone number visible).
   - Creating a test conversation (or opening an existing one).
   - Sending a message from the CRM.
   - The same message in WhatsApp on your phone.
2. Add captions in English.
3. In the submission notes, state that the app uses server-to-server integration (no Meta login flow).
