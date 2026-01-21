import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";

// ----------------------------
// MOCK CONTROLLER (export default)
// ----------------------------
vi.mock("../../controllers/auth.controller", () => ({
    default: {
        emailPasswordLogin: vi.fn().mockImplementation((req, res) =>
            res.json({ test: "emailPasswordLogin-called" })
        ),
        redirectToGoogleLogin: vi.fn().mockImplementation((req, res) =>
            res.json({ test: "redirectToGoogleLogin-called" })
        ),
        googleCallback: vi.fn().mockImplementation((req, res) =>
            res.json({ test: "googleCallback-called" })
        ),
        updatePassword: vi.fn().mockImplementation((req, res) =>
            res.json({ test: "updatePassword-called" })
        ),
        forgotPassword: vi.fn().mockImplementation((req, res) =>
            res.json({ test: "forgotPassword-called" })
        ),
        resetPassword: vi.fn().mockImplementation((req, res) =>
            res.json({ test: "resetPassword-called" })
        ),
    }
}));

// IMPORT MOCKED CONTROLLER
import authController from "../../controllers/auth.controller";

// ROUTER (AFTER MOCKS)
import express from "express";
import router from "../../routes/auth.routes"; // <— must exist

const app = express();
app.use(express.json());
app.use("/auth", router);

describe("Auth Routes Unit Tests", () => {
    beforeEach(() => vi.clearAllMocks());

    // ------------------------------
    // LOGIN
    // ------------------------------
    it("POST /auth/login", async () => {
        const res = await (await import("supertest")).default(app)
            .post("/auth/login")
            .send({});

        expect(res.body.test).toBe("emailPasswordLogin-called");
        expect(authController.emailPasswordLogin).toHaveBeenCalled();
    });

    // ------------------------------
    // GOOGLE LOGIN REDIRECT
    // ------------------------------
    it("GET /auth/google", async () => {
        const res = await (await import("supertest")).default(app)
            .get("/auth/google");

        expect(res.body.test).toBe("redirectToGoogleLogin-called");
        expect(authController.redirectToGoogleLogin).toHaveBeenCalled();
    });

    // ------------------------------
    // GOOGLE CALLBACK
    // ------------------------------
    it("POST /auth/callback", async () => {
        const res = await (await import("supertest")).default(app)
            .post("/auth/callback")
            .send({});

        expect(res.body.test).toBe("googleCallback-called");
        expect(authController.googleCallback).toHaveBeenCalled();
    });

    // ------------------------------
    // CHANGE PASSWORD
    // ------------------------------
    it("POST /auth/change_password", async () => {
        const res = await (await import("supertest")).default(app)
            .post("/auth/change_password")
            .send({});

        expect(res.body.test).toBe("updatePassword-called");
        expect(authController.updatePassword).toHaveBeenCalled();
    });

    // ------------------------------
    // FORGOT PASSWORD
    // ------------------------------
    it("POST /auth/forgot_password", async () => {
        const res = await (await import("supertest")).default(app)
            .post("/auth/forgot_password")
            .send({});

        expect(res.body.test).toBe("forgotPassword-called");
        expect(authController.forgotPassword).toHaveBeenCalled();
    });

    // ------------------------------
    // RESET PASSWORD
    // ------------------------------
    it("GET /auth/reset_password", async () => {
        const res = await (await import("supertest")).default(app)
            .get("/auth/reset_password");

        expect(res.body.test).toBe("resetPassword-called");
        expect(authController.resetPassword).toHaveBeenCalled();
    });
});
