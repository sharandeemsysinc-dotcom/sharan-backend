import prisma from "../config/prisma";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { sendEmail } from "../utils/sendMail";
import crypto from "crypto";

// Define the User type with role relation included
type UserWithRole = Prisma.UserGetPayload<{
    include: { role: true }
}>;

export async function generateOTP(email: string) {
    // 1. Check for existing user and cooldown period
    const existingUser = await prisma.user.findUnique({
        where: { email },
    });

    // Check if 1 hour has passed since last OTP expired
    if (existingUser?.otp_requested_at) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (existingUser.otp_requested_at > oneHourAgo) {
            throw new Error("Try after 1 hour");
        }
    }

    // 2. Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();

    // 3. Hash the code
    const salt = await bcrypt.genSalt(10);
    const codeHash = await bcrypt.hash(code, salt);

    // 4. Store in User table
    // No time-based expiry - OTP only expires after 5 attempts or successful login

    if (existingUser) {
        // Update existing user with new OTP
        await prisma.user.update({
            where: { email },
            data: {
                otp_code_hash: codeHash,
                otp_attempts: 0, // Reset attempts
                otp_requested_at: null, // Clear the expiry timestamp when generating new OTP
            },
        });
    } else {
        throw new Error("User not registered");
    }

    // 5. Send via SES
    const htmlTemplate = `
    <h2>Your Verification Code</h2>
    <p>Your OTP code is:</p>
    <h3>${code}</h3>
    <p>This code is valid until you successfully login or exceed 5 attempts.</p>
  `;

    const mailResponse = await sendEmail({
        to: email,
        subject: "Your Verification Code",
        html: htmlTemplate,
        text: `Your verification code is ${code}`,
    });


    return mailResponse;
}

export async function verifyOTP(email: string, code: string): Promise<UserWithRole> {
    // 1. Find the user with OTP data
    const user = await prisma.user.findUnique({
        where: { email },
        include: { role: true },
    });

    if (!user || !user.otp_code_hash) {
        throw new Error("Invalid code or no OTP requested");
    }

    // 2. Check attempts - if already at 5, OTP is expired
    if (user.otp_attempts >= 5) {
        // Record expiry timestamp for 1-hour cooldown
        await prisma.user.update({
            where: { email },
            data: {
                otp_requested_at: new Date(),
                otp_code_hash: null,
            },
        });
        throw new Error("Too many attempts. Please request a new code.");
    }

    // 3. Compare code
    const isMatch = await bcrypt.compare(code, user.otp_code_hash);

    if (!isMatch) {
        const newAttempts = user.otp_attempts + 1;

        // Check if this was the 5th attempt
        if (newAttempts >= 5) {
            // Expire OTP and record timestamp for 1-hour cooldown
            await prisma.user.update({
                where: { email },
                data: {
                    otp_attempts: newAttempts,
                    otp_requested_at: new Date(),
                    otp_code_hash: null,
                },
            });
            throw new Error("Too many attempts. Please request a new code.");
        } else {
            // Just increment attempts
            await prisma.user.update({
                where: { email },
                data: { otp_attempts: newAttempts },
            });
            throw new Error("Invalid code");
        }
    }

    // 4. Valid - Clear OTP data and mark email as verified
    const updatedUser = await prisma.user.update({
        where: { email },
        data: {
            otp_code_hash: null,
            otp_attempts: 0,
            otp_requested_at: null, // Clear expiry timestamp after successful login
            is_email_verified: true,
            last_login_at: new Date(),
        },
        include: { role: true },
    });

    return updatedUser;
}
