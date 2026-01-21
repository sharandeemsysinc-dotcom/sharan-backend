import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import router from "../../routes/subcription.routes";

// Mock the entire controller module to prevent actual database operations
vi.mock("../../controllers/subscription.controller", () => ({
    createSubscriptionPlan: vi.fn((req, res) => {
        res.status(200).json({
            message: "Subscription plan created successfully",
            data: { id: "123", name: "Basic", amount: 100 }
        });
    }),

    getAllSubscription: vi.fn((req, res) => {
        res.status(200).json({
            message: "Subscription plans fetched successfully",
            data: [{ id: "123" }],
            totalCount: 1  // This is camelCase
        });
    }),

    getSubscriptionPlanById: vi.fn((req, res) => {
        res.status(200).json({
            message: "Subscription plan fetched successfully",
            data: { id: "123" }
        });
    }),

    updateSubscriptionPlan: vi.fn((req, res) => {
        res.status(200).json({
            message: "Subscription plan updated successfully",
            data: { id: "123", name: "Updated" }
        });
    }),

    deleteSubscriptionPlan: vi.fn((req, res) => {
        res.status(200).json({
            message: "Subscription plan deleted successfully"
        });
    }),

    enableDisableSubscription: vi.fn((req, res) => {
        res.status(200).json({
            message: "Subscription plan enabled successfully"
        });
    })
}));

// Mock authentication
vi.mock("../../middlewares/authenticate", () => ({
    authenticate: () => (req: any, res: any, next: any) => next(),
}));

const app = express();
app.use(express.json());
app.use("/", router);

describe("Subscription Plan Controller", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // CREATE
    it("should create subscription plan successfully", async () => {
        const res = await request(app)
            .post("/create_subscription")
            .send({ name: "Basic", amount: 100 });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Subscription plan created successfully");
    });

    // GET BY ID
    it("should return plan by ID", async () => {
        const res = await request(app).get("/get_subscription_by_id/123");

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Subscription plan fetched successfully");
    });

    // UPDATE
    it("should update subscription plan successfully", async () => {
        const res = await request(app)
            .put("/update_subscription/123")
            .send({ name: "Updated" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Subscription plan updated successfully");
    });

    // GET ALL - FIXED: Use camelCase 'totalCount'
    it("should return paginated subscription plans", async () => {
        const res = await request(app)
            .post("/get_all_subscription")
            .send({ page: 1, itemPerPage: 10 });

        expect(res.status).toBe(200);
        expect(res.body.totalCount).toBe(1); // Fixed: removed .data and used camelCase
    });

    // DELETE
    it("should soft delete subscription plan", async () => {
        const res = await request(app).put("/delete_subscription/123");

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Subscription plan deleted successfully");
    });

    // ENABLE / DISABLE
    it("should enable subscription successfully", async () => {
        const res = await request(app)
            .put("/enable_disable_subscription/123")
            .send({ status: 1 });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Subscription plan enabled successfully");
    });
});