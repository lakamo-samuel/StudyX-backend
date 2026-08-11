import { eq } from "drizzle-orm";
import { db } from "../../config/db";
import { users } from "../../db/schema/users";
import {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyOtpInput,
} from "./auth.schema";
import { AppError } from "../../middleware/error.middleware";
import crypto from "crypto";
import emailTemplate from "../../utils/mail";
import bcrypt from "bcryptjs";
import { redis } from "../../config/redis";
import { sendEmail } from "../../lib/email";
import { signToken } from "../../lib/token";

// ── REGISTER ──
export const register = async (input: RegisterInput) => {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1)

  if (existing.length > 0) {
    throw new AppError('Email already in use', 409)
  }

  const hashedPassword = await bcrypt.hash(input.password, 12)

  const [user] = await db
    .insert(users)
    .values({
      name:       input.name,
      email:      input.email,
      password:   hashedPassword,
      university: input.university,
      course:     input.course,
      year:       input.year,
    })
    .returning()

  const otp = Math.floor(100000 + Math.random() * 900000).toString()

  await redis.set(`otp:${user.email}`, otp, 'EX', 60 * 10)

  // log OTP to console in development so you can test without email
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔑 OTP for ${user.email}: ${otp}`)
  }

  try {
    await sendEmail({
      to: user.email,
      subject: 'Verify your Vyrdly account',
      html: emailTemplate({ firstName: user.name.split(' ')[0], code: otp })
    })
  } catch (emailErr) {
    console.warn('⚠️ Email not sent — check Resend config. OTP logged to console.')
  }

  return { message: 'Account created. Check your email for the verification code.' }
}

export const verifyOtp = async (input: VerifyOtpInput) => {
  const storedOtp = await redis.get(`otp:${input.email}`);

  if (!storedOtp || storedOtp !== input.otp) {
    throw new AppError("Invalid or expired OTP", 400);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  await redis.del(`otp:${input.email}`);

  // Mark the account as verified
  await db
    .update(users)
    .set({ isVerified: true, updatedAt: new Date() })
    .where(eq(users.email, input.email));

  const token = signToken({ userId: user.id, email: user.email });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      university: user.university,
      course: user.course,
      year: user.year,
      avatar: user.avatar,
      streak: user.streak,
    },
  };
};

// Login

export const login = async (input: LoginInput) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email));

  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  const isMatch = await bcrypt.compare(input.password, user.password);

  if (!isMatch) {
    throw new AppError("Invalid email or password", 401);
  }

  if (!user.isVerified) {
    // Re-send OTP so they can complete verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redis.set(`otp:${user.email}`, otp, 'EX', 60 * 10);

    if (process.env.NODE_ENV === 'development') {
      console.log(`🔑 OTP for ${user.email}: ${otp}`);
    }

    try {
      await sendEmail({
        to: user.email,
        subject: 'Verify your Vyrdly account',
        html: emailTemplate({ firstName: user.name.split(' ')[0], code: otp })
      });
    } catch {
      console.warn('⚠️ Email not sent — OTP logged to console.');
    }

    throw new AppError("Email not verified. A new verification code has been sent to your email.", 403);
  }

  const token = signToken({ userId: user.id, email: user.email });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      university: user.university,
      course: user.course,
      year: user.year,
      avatar: user.avatar,
      streak: user.streak,
    },
  };
};

// ── FORGOT PASSWORD ──
export const forgotPassword = async (input: ForgotPasswordInput) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (!user) {
    return { message: "If that email exists, a reset link has been sent." };
  }

  const resetToken = crypto.randomInt(100000, 999999).toString();

  // Store as token→email so we can look it up directly without scanning all keys
  await redis.set(`reset:token:${resetToken}`, user.email, "EX", 60 * 15);

  await sendEmail({
    to: user.email,
    subject: "Reset your Vyrdly password",
    html: `
      <h2>Password Reset</h2>
      <p>Your reset code is:</p>
      <h1 style="letter-spacing: 8px;">${resetToken}</h1>
      <p>This code expires in 15 minutes.</p>
      <p>If you did not request this, ignore this email.</p>
    `,
  });

  return { message: "If that email exists, a reset link has been sent." };
};

// RESET PASSWORD

export const resetPassword = async (input: ResetPasswordInput) => {
  // Direct O(1) lookup — no more redis.keys() full scan
  const userEmail = await redis.get(`reset:token:${input.token}`);

  if (!userEmail) {
    throw new AppError("Invalid or expired reset token", 400);
  }

  const hashedPassword = await bcrypt.hash(input.password, 12);

  await db
    .update(users)
    .set({ password: hashedPassword, updatedAt: new Date() })
    .where(eq(users.email, userEmail));

  await redis.del(`reset:token:${input.token}`);

  return { message: "Password reset successfully. You can now log in." };
};