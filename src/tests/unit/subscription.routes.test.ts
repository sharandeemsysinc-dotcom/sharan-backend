import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";
import router from "../../routes/subcription.routes";

// Correct mock path
vi.mock("../../middlewares/authenticate", () => ({
    authenticate: () => (req: any, res: any, next: any) => next()
}));

// Mock controller so routes do NOT hit actual DB
vi.mock("../../controllers/subscription.controller", () => ({
    createSubscriptionPlan: (req: any, res: any) => res.status(200).json({ ok: true }),
    getAllSubscription: (req: any, res: any) => res.status(200).json({ ok: true }),
    getSubscriptionPlanById: (req: any, res: any) => res.status(200).json({ ok: true }),
    updateSubscriptionPlan: (req: any, res: any) => res.status(200).json({ ok: true }),
    deleteSubscriptionPlan: (req: any, res: any) => res.status(200).json({ ok: true }),
    enableDisableSubscription: (req: any, res: any) => res.status(200).json({ ok: true }),
}));

const app = express();
app.use(express.json());
app.use("/", router);

describe("Subscription Routes", () => {
    it("should route POST /create_subscription", async () => {
        const res = await request(app).post("/create_subscription").send({});
        expect(res.status).toBe(200); // route exists
    });

    it("should route POST /get_all_subscription", async () => {
        const res = await request(app).post("/get_all_subscription").send({});
        expect(res.status).toBe(200);
    });

    it("should route GET /get_subscription_by_id/:id", async () => {
        const res = await request(app).get("/get_subscription_by_id/123");
        expect(res.status).toBe(200);
    });

    it("should route PUT /update_subscription/:id", async () => {
        const res = await request(app).put("/update_subscription/123").send({});
        expect(res.status).toBe(200);
    });

    it("should route PUT /delete_subscription/:id", async () => {
        const res = await request(app).put("/delete_subscription/123");
        expect(res.status).toBe(200);
    });

    it("should route PUT /enable_disable_subscription/:id", async () => {
        const res = await request(app).put("/enable_disable_subscription/123").send({});
        expect(res.status).toBe(200);
    });
});
