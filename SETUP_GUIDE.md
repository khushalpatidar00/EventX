# Complete Setup Guide: MongoDB Atlas & Application Configuration

This guide will walk you through exactly how to set up your backend dependencies, including MongoDB Atlas (the remote cloud database), followed by starting up the application.

---

## Step 1: Set Up MongoDB Atlas (Your Database)

MongoDB Atlas provides a fully managed, free cloud database. This is where `mongoose` will store all your `Users`, `Events`, and `Bookings`.

1. **Sign Up / Log In**:
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) and create a free account.
2. **Create a Cluster**:
   - Once logged in, click **"Build a Database"** or **"Create Cluster"**.
   - Select the **"M0 Sandbox" (Free Tier)** option.
   - Choose a provider (e.g., AWS, Google Cloud) and click **Create** (no credit card required).
3. **Set Up Database Access (Credentials)**:
   - On the left sidebar, click **"Database Access"**.
   - Click **"Add New Database User"**.
   - Choose Password authentication.
   - Set a Username (e.g., `eventxadmin`) and a Password (e.g., `eventxpassword`). **Remember these.**
   - Click **Add User**.
4. **Set Up Network Access (IP Whitelist)**:
   - On the left sidebar, click **"Network Access"**.
   - Click **"Add IP Address"**.
   - Choose **"Allow Access from Anywhere"** (this sets the IP to `0.0.0.0/0`) so that your local machine (and later, Vercel/Render) can connect to it.
   - Click **Confirm**.
5. **Get Your Connection String**:
   - On the left sidebar, click **"Database"** (under Deployments).
   - Click the **"Connect"** button on your new cluster.
   - Choose **"Drivers"** (Connect your application).
   - Copy the connection string provided. It will look something like this:
     `mongodb+srv://eventxadmin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   - **Important**: Replace `<password>` in the string with the actual password you created in Step 3. (Do not include the `< >` brackets).

---

## Step 2: Set Up Gmail App Passwords (For Nodemailer)

To send emails automatically (booking confirmations), you need to configure an App Password for your Gmail account. Normal passwords won't work because of 2FA.

1. Go to your [Google Account Manage page](https://myaccount.google.com/).
2. Navigate to the **Security** tab on the left.
3. Under "How you sign in to Google", select **2-Step Verification** and make sure it is turned ON.
4. Once ON, go back to the Security tab and search for **App Passwords**.
5. Generate a new App Password and name it **"EventX"**.
6. Copy the 16-character password generated.

---

## Step 3: Configure the Environment Variables (`.env`)

Now that you have your credentials, you need to plug them into the backend. Open the file located at `server/.env` and paste your values:

```env
# Paste the MongoDB string you generated (make sure you swapped the password)
MONGO_URI=mongodb+srv://eventxadmin:your_actual_password@cluster0.xxxxx.mongodb.net/eventx?retryWrites=true&w=majority

# Use a strong random secret and keep it secure.
JWT_SECRET=your_secure_jwt_secret

# Email Setup Configured using Step 2
EMAIL_USER=yourgmail@gmail.com
EMAIL_PASS=the_16_character_app_password

PORT=5000