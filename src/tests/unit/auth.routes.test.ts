import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// 1. MOCK THE CONTROLLER DEFAULT EXPORT
vi.mock("../../controllers/auth.controller", () => {
    return {
        default: {
            emailPasswordLogin: vi.fn((req, res) =>
                res.json({ test: "emailPasswordLogin-called" })
            ),
            redirectToGoogleLogin: vi.fn((req, res) =>
                res.json({ test: "redirectToGoogleLogin-called" })
            ),
            googleCallback: vi.fn((req, res) =>
                res.json({ test: "googleCallback-called" })
            ),
            updatePassword: vi.fn((req, res) =>
                res.json({ test: "updatePassword-called" })
            ),
            forgotPassword: vi.fn((req, res) =>
                res.json({ test: "forgotPassword-called" })
            ),
            resetPassword: vi.fn((req, res) =>
                res.json({ test: "resetPassword-called" })
            )
        }
    };
});

// IMPORT ROUTER (AFTER MOCK)
import router from "../../routes/auth.routes";

// IMPORT DEFAULT EXPORT FOR ASSERTION
import authController from "../../controllers/auth.controller";

const app = express();
app.use(express.json());
app.use("/auth", router);

describe("Auth Routes Unit Tests", () => {

    beforeEach(() => vi.clearAllMocks());

    it("POST /auth/login", async () => {
        const res = await request(app).post("/auth/login").send({});
        expect(res.body.test).toBe("emailPasswordLogin-called");
        expect(authController.emailPasswordLogin).toHaveBeenCalled();
    });

    it("GET /auth/google", async () => {
        const res = await request(app).get("/auth/google");
        expect(res.body.test).toBe("redirectToGoogleLogin-called");
        expect(authController.redirectToGoogleLogin).toHaveBeenCalled();
    });

    it("POST /auth/callback", async () => {
        const res = await request(app).post("/auth/callback").send({});
        expect(res.body.test).toBe("googleCallback-called");
        expect(authController.googleCallback).toHaveBeenCalled();
    });

    it("POST /auth/change_password", async () => {
        const res = await request(app).post("/auth/change_password").send({});
        expect(res.body.test).toBe("updatePassword-called");
        expect(authController.updatePassword).toHaveBeenCalled();
    });

    it("POST /auth/forgot_password", async () => {
        const res = await request(app).post("/auth/forgot_password").send({});
        expect(res.body.test).toBe("forgotPassword-called");
        expect(authController.forgotPassword).toHaveBeenCalled();
    });

    it("GET /auth/reset_password", async () => {
        const res = await request(app).get("/auth/reset_password");
        expect(res.body.test).toBe("resetPassword-called");
        expect(authController.resetPassword).toHaveBeenCalled();
    });
});
