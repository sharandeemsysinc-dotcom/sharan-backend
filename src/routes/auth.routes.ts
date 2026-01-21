import { Router } from "express";
import AuthController from "../controllers/auth.controller";

const router = Router();


// Email Verification (OTP)
router.post("/email_verification", AuthController.emailVerification);

// Login with OTP
router.post("/login", AuthController.loginWithOTP);

// Google Login Redirect
router.get("/google_login", AuthController.redirectToGoogleLogin);

// Google Callback
router.get("/google/callback", AuthController.googleCallback);

// Change Password
router.post("/change_password", AuthController.updatePassword);

// Forgot Password
router.post("/forgot_password", AuthController.forgotPassword);

// Reset Password
router.get("/reset_password", AuthController.resetPassword);

// Email Verification (OTP)
router.post("/email_verification", AuthController.emailVerification);

// Login with OTP
router.post("/login", AuthController.loginWithOTP);

// Validate Email
router.post("/validate_email", AuthController.validateEmail);

// Google Login (Direct Token)
router.post("/google_login", AuthController.googleLogin);

export default router;
