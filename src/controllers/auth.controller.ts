import { Request, Response } from "express";
import prisma from "../config/prisma";
import axios from "axios";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import logger from "../utils/logger";
import { successResponse, errorResponse } from "../utils/responseHandler";
import { sendEmail } from "../utils/sendMail";
import { exchangeCodeForTokens, getUserInfo } from "../utils/cognito";

import { generateOTP, verifyOTP } from "../services/otp.service";

const component = "Auth Controller";
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* Async handler */
async function handle<T>(promise: Promise<T>): Promise<[any, T | undefined]> {
  try {
    const data = await promise;
    return [null, data];
  } catch (error) {
    return [error, undefined];
  }
};

/**
 * Common logic to generate JWTs and fetch profile IDs after successful authentication
 */
async function performLogin(user: any, res: Response) {
  // Generate JWT
  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role_id: user.role_id,
      role: user.role?.name,
    },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: "2h" }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: "7d" }
  );

  await prisma.user.update({
    where: { id: user.id },
    data: {
      refresh_token: refreshToken,
      last_login_at: new Date()
    }
  });

  // Fetch Specific ID based on Role
  let login_id = null;

  if (user.role?.name === "Coach") {
    const coach = await prisma.coach.findUnique({ where: { user_id: user.id } });
    login_id = coach?.id;
  } else if (user.role?.name === "Client") {
    const client = await prisma.client.findUnique({ where: { user_id: user.id } });
    login_id = client?.id;
  } else if (user.role?.name === "Staff") {
    const staff = await prisma.staff.findUnique({ where: { user_id: user.id } });
    login_id = staff?.id;
  } else if (user.role?.name === "Admin") {
    const admin = await prisma.admin.findUnique({ where: { user_id: user.id } });
    login_id = admin?.id;
  }

  return successResponse(res, 200, "Login successful", {
    user: {
      id: user.id,
      email: user.email,
      name: user.user_name,
      role_id: user.role_id,
      role_name: user.role?.name,
      login_id: login_id
    },
    access_token: accessToken,
    refresh_token: refreshToken
  });
}

// DIRECT GOOGLE LOGIN REDIRECT
async function redirectToGoogleLogin(_req: Request, res: Response) {
  const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${process.env.GOOGLE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/auth/google/callback")}` +
    `&response_type=code` +
    `&scope=email+profile+openid` +
    `&access_type=offline` +
    `&prompt=consent`;

  res.redirect(googleUrl);
};

async function googleCallback(req: Request, res: Response) {
  const { code, error, error_description } = req.query;

  if (error) {
    logger.error({ component }, "Google OAuth Error", { error, error_description });
    return errorResponse(res, 400, `Google OAuth Error: ${error_description || error}`);
  }

  if (!code) {
    return errorResponse(res, 400, "Missing authorization code. Please initiate login from /auth/google_login.");
  }

  try {
    // Step 1: Exchange code for tokens directly with Google
    const tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.OAUTH_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/auth/google/callback",
      grant_type: "authorization_code",
    });

    const { access_token } = tokenResponse.data;

    // Step 2: Get Google user info
    const userInfoResponse = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const userInfo = userInfoResponse.data;

    if (!userInfo || !userInfo.email) {
      return errorResponse(res, 400, "Failed to get user info from Google");
    }

    const email = userInfo.email as string;

    // Fetch user by email
    let user = await prisma.user.findUnique({
      where: { email },
      include: { role: true }
    });

    // AUTO-REGISTRATION: If user doesn't exist, create as a Client
    if (!user) {
      logger.info({ component }, "Auto-registering new Google user", { email });

      const firstName = (userInfo.given_name || userInfo.name || "User") as string;
      const lastName = (userInfo.family_name || "") as string;

      user = (await prisma.user.create({
        data: {
          email,
          user_name: (userInfo.name || email.split("@")[0]) as string,
          is_email_verified: true,
          role_id: 4, // Client
          status: 1
        },
        include: { role: true }
      })) as any;

      await prisma.client.create({
        data: {
          user_id: (user as any).id,
          first_name: firstName,
          last_name: lastName,
          email: email,
          status: 1
        }
      });
    }

    return performLogin(user, res);
  } catch (err: any) {
    console.error("Google callback error:", err.response?.data || err.message);
    return errorResponse(res, 500, "Google login failed: " + (err.response?.data?.error_description || err.message));
  }
};

// DIRECT GOOGLE LOGIN (FROM FRONTEND ID TOKEN)
async function googleLogin(req: Request, res: Response) {
  logger.info({ component }, "Direct Google Login API Called");
  const { idToken, role_id } = req.body;

  if (!idToken) return errorResponse(res, 400, "ID Token is required");

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID!,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return errorResponse(res, 400, "Invalid Google Token");
    }

    const email = payload.email as string;

    // Fetch user by email
    let user = await prisma.user.findUnique({
      where: { email },
      include: { role: true }
    });

    // AUTO-REGISTRATION: If user doesn't exist, create as a Client
    if (!user) {
      logger.info({ component }, "Auto-registering new Google user (Direct Token)", { email });

      const fullName = (payload.name || email.split("@")[0]) as string;
      const givenName = (payload.given_name || fullName) as string;
      const familyName = (payload.family_name || "") as string;

      user = (await prisma.user.create({
        data: {
          email,
          user_name: fullName,
          is_email_verified: true,
          role_id: 4, // Client
          status: 1
        },
        include: { role: true }
      })) as any;

      await prisma.client.create({
        data: {
          user_id: (user as any).id,
          first_name: givenName,
          last_name: familyName,
          email: email,
          status: 1
        }
      });
    }

    // Ensure user is not null and has role (casting for TS)
    const finalUser = user as any;
    if (!finalUser) {
      return errorResponse(res, 500, "Failed to identify user account");
    }

    // Role portal check (similar to emailPasswordLogin)
    if (role_id) {
      const dbRole = finalUser.role_id;
      if ([1, 2, 3].includes(role_id)) {
        if (dbRole === 4) {
          return errorResponse(res, 403, "Access denied. Clients must use the Client Login portal.");
        }
      } else if (role_id === 4) {
        if (dbRole !== 4) {
          return errorResponse(res, 403, "Access denied. This portal is restricted to client accounts only");
        }
      }
    }

    return performLogin(finalUser, res);
  } catch (error: any) {
    logger.error({ component }, error.message);
    return errorResponse(res, 400, "Google login failed: " + error.message);
  }
}

// EMAIL + PASSWORD LOGIN
async function emailPasswordLogin(req: Request, res: Response) {
  logger.info({ component }, "Inside Login Functionality ");

  const { email, password, role_id } = req.body;

  if (!email || !password || !role_id) {
    return errorResponse(res, 400, "Email, password & role are required");
  }

  // Fetch user by email only
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true }
  });

  if (!user) return errorResponse(res, 404, "User not found");

  const dbRole = user.role_id;

  // Admin / Staff / Coach login (1,2,3)
  if ([1, 2, 3].includes(role_id)) {

    if (dbRole === 4) {
      return errorResponse(res, 403, "Access denied. Clients must use the Client Login portal.");
    }
  }

  // Client login (4)
  else if (role_id === 4) {

    if (dbRole !== 4) {
      return errorResponse(res, 403, "Access denied. This portal is restricted to client accounts only");
    }
  }
  else {
    return errorResponse(res, 400, "Invalid role_id");
  }

  // Check password
  const isMatch = await bcrypt.compare(password, user.password_hash ?? "");
  if (!isMatch) return errorResponse(res, 401, "Invalid password");

  return performLogin(user, res);
};

// CHANGE PASSWORD
async function updatePassword(req: Request, res: Response) {
  logger.info({ component }, "Updating password");

  const { user_id, old_password, new_password } = req.body;

  if (!user_id || !old_password || !new_password) {
    return errorResponse(res, 400, "user_id, old_password and new_password are required");
  }

  const [errUser, user] = await handle(prisma.user.findUnique({ where: { id: user_id } }));

  if (!user) return errorResponse(res, 404, "User not found");

  const isMatch = await bcrypt.compare(old_password, user.password_hash ?? "");
  if (!isMatch) return errorResponse(res, 401, "Old password is incorrect");

  const hashedPassword = await bcrypt.hash(new_password, 10);

  await handle(
    prisma.user.update({
      where: { id: user_id },
      data: { password_hash: hashedPassword, updated_at: new Date() },
    })
  );
  return successResponse(res, 200, "Password updated successfully");
};


// FORGOT PASSWORD
async function forgotPassword(req: Request, res: Response) {
  logger.info({ component }, "Processing forgot password");

  const { email } = req.body;
  if (!email) return errorResponse(res, 400, "Email is required");

  const [errUser, user] = await handle(
    prisma.user.findUnique({ where: { email } })
  );
  if (!user) return errorResponse(res, 404, "User not found");

  // Create JWT reset token
  const resetToken = jwt.sign(
    { email: user.email },
    process.env.JWT_RESET_SECRET!,
    { expiresIn: "15m" }
  );

  const resetLink = `${process.env.FORGET_PASS_LINK}/auth/reset_password?token=${encodeURIComponent(resetToken)}`;

  const htmlTemplate = `
    <h2>Password Reset Request</h2>
    <p>We received a request to reset your password.</p>
    <p>Click below to reset your password:</p>
    <a href="${resetLink}"
       style="padding:12px 20px;background:#4f46e5;color:white;border-radius:6px;text-decoration:none;display:inline-block;">
      Reset Password
    </a>
    <br/><br/>
    <p>This link expires in <b>15 minutes</b>.</p>
  `;

  //  RECEIVE SES RESPONSE
  const mailResponse = await sendEmail({
    to: email,
    subject: "Reset Your Password",
    html: htmlTemplate,
    text: `Reset your password using this link: ${resetLink}`,
  });

  //  CHECK SES RESULT
  if (!mailResponse.success) {
    return errorResponse(
      res,
      500,
      `Failed to send temporary password email: ${mailResponse.error || mailResponse.message}`
    );

  }
  return successResponse(res, 200, "Reset link sent to email successfully", {
    emailStatus: mailResponse,
  });
};

// RESET PASSWORD
async function resetPassword(req: Request, res: Response) {
  const { token } = req.query;
  if (!token) return errorResponse(res, 400, "Token is required");

  let decoded;
  try {
    decoded = jwt.verify(String(token), process.env.JWT_RESET_SECRET!);
  } catch {
    return errorResponse(res, 400, "Invalid or expired token");
  }

  const email = (decoded as any).email;
  const tempPassword = email.split("@")[0];
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  await prisma.user.update({
    where: { email },
    data: { password_hash: hashedPassword },
  });

  const htmlTemplate = `
    <h2>Password Reset Successfully</h2>
    <p>Your temporary password is:</p>
    <h3>${tempPassword}</h3>
    <p>Please log in and update your password immediately.</p>
  `;

  // SEND TEMP PASSWORD EMAIL
  const mailResponse = await sendEmail({
    to: email,
    subject: "Your Temporary Password",
    html: htmlTemplate,
    text: `Your temporary password is ${tempPassword}`,
  });

  // HANDLE SES FAILURE
  if (!mailResponse.success) {
    return errorResponse(
      res,
      500,
      `Failed to send temporary password email: ${mailResponse.error || mailResponse.message}`
    );
  }

  return successResponse(res, 200, "Temporary password sent to email", {
    emailStatus: mailResponse,
  });
};

// EMAIL VERIFICATION (OTP GENERATION)
async function emailVerification(req: Request, res: Response) {
  const { email } = req.body;
  if (!email) return errorResponse(res, 400, "Email is required");

  try {
    const response = await generateOTP(email);
    if (response.success == true) {
      return successResponse(res, 200, "OTP sent successfully");
    }
    else {
      return errorResponse(res, 500, response.message);
    }
  } catch (error) {
    console.error("OTP Generation Error:", error);
    return errorResponse(res, 500, "Failed to send OTP");
  }
};

// LOGIN WITH OTP
async function loginWithOTP(req: Request, res: Response) {
  const { email, secret_code } = req.body;
  if (!email || !secret_code) return errorResponse(res, 400, "Email and secret_code are required");

  try {
    const user = await verifyOTP(email, secret_code);

    // Generate JWT (Existing logic)
    // Note: To use Auth.js session, the client should ideally use the Auth.js /signin endpoint.
    // Here we return the custom JWT as per existing flow.

    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role_id: user.role_id,
        role: user.role?.name,
      },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: "2h" }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: "7d" }
    );

    await prisma.user.update({
      where: { id: user.id },
      data: {
        refresh_token: refreshToken,
        last_login_at: new Date()
      }
    });

    // Fetch Specific ID based on Role
    let login_id = null;

    if (user.role?.name === "Coach") {
      const coach = await prisma.coach.findUnique({ where: { user_id: user.id } });
      login_id = coach?.id;
    } else if (user.role?.name === "Client") {
      const client = await prisma.client.findUnique({ where: { user_id: user.id } });
      login_id = client?.id;
    } else if (user.role?.name === "Staff") {
      const staff = await prisma.staff.findUnique({ where: { user_id: user.id } });
      login_id = staff?.id;
    } else if (user.role?.name === "Admin") {
      // Admin might just use user.id or have an Admin table
      const admin = await prisma.admin.findUnique({ where: { user_id: user.id } });
      login_id = admin?.id;
    }

    return successResponse(res, 200, "Login successful", {
      user: {
        id: user.id,
        email: user.email,
        name: user.user_name,
        role_id: user.role_id,
        role_name: user.role?.name
      },
      login_id: login_id,
      access_token: accessToken,
      refresh_token: refreshToken
    });

  } catch (error: any) {
    return errorResponse(res, 400, error.message || "Login failed");
  }
};

// EMAIL VALIDATION
async function validateEmail(req: Request, res: Response) {
  logger.info({ component }, "Validating email and role");
  const { email, role } = req.body;

  if (!email) {
    return errorResponse(res, 400, "Email is required");
  }

  if (!role) {
    return errorResponse(res, 400, "Role is required");
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return errorResponse(res, 400, "Invalid email format");
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: { role: true }
    });

    if (existingUser) {
      return errorResponse(res, 409, `Email already exists as ${existingUser.role?.name || 'a user'}`);
    }

    return successResponse(res, 200, "Email is available");
  } catch (error: any) {
    logger.error({ component }, error.message);
    return errorResponse(res, 500, error.message);
  }
};

export default {
  redirectToGoogleLogin,
  googleCallback,
  emailPasswordLogin,
  updatePassword,
  forgotPassword,
  resetPassword,
  emailVerification,
  loginWithOTP,
  validateEmail,
  googleLogin,
};

