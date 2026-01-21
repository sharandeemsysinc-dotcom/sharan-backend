import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import coachController from "../../controllers/coach.controller";
import prisma from "../../config/prisma";
import bcrypt from "bcryptjs";
import { sendEmail } from "../../utils/sendMail";
import { stripe } from "../../config/stripe";


// -----------------------------
// 🔹 MOCKS
// -----------------------------

vi.mock("../../config/prisma", () => ({
    default: {
        $transaction: vi.fn((callback) => callback(prisma)),
        user: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        coach: {
            create: vi.fn(),
            count: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock("bcryptjs", () => ({
    default: {
        hash: vi.fn(),
        compare: vi.fn(),
    },
}));

vi.mock("../../config/stripe", () => ({
    stripe: {
        customers: {
            create: vi.fn(),
        },
        paymentIntents: {
            create: vi.fn(),
        },
    },
}));

vi.mock("../../utils/sendMail", () => ({
    sendEmail: vi.fn(),
}));

// Mock Logger
vi.mock("../../utils/logger", () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

// -----------------------------
// 🔹 TEST SUITE
// -----------------------------

describe("Coach Controller Unit Tests", () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let jsonMock: any;
    let statusMock: any;

    beforeEach(() => {
        jsonMock = vi.fn();
        statusMock = vi.fn(() => ({ json: jsonMock }));

        req = {
            body: {},
            query: {},
            params: {},
            files: {},
            user: { id: "admin123", role: "Admin" }
        } as any;

        res = {
            status: statusMock,
            json: jsonMock,
        } as unknown as Response;

        vi.clearAllMocks();
        process.env.PUBLIC_BUCKET_NAME = "test-bucket";
        process.env.S3StorageLinkForimages = "https://s3.com/";
        process.env.FORGET_PASS_LINK = "http://localhost";
    });

    // -----------------------------
    // CREATE COACH
    // -----------------------------
    describe("createCoach", () => {
        it("should return 400 if email is missing", async () => {
            req.body = { full_name: "Test Coach" };
            await coachController.createCoach(req, res as Response);

            expect(statusMock).toHaveBeenCalledWith(400);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                message: "Email is required",
            }));
        });

        it("should create coach successfully", async () => {
            req.body = { email: "coach@test.com", full_name: "Coach Name" };

            (bcrypt.hash as any).mockResolvedValue("hashed_password");
            (prisma.user.findUnique as any).mockResolvedValue(null);
            (prisma.user.create as any).mockResolvedValue({ id: 1 });
            (prisma.coach.create as any).mockResolvedValue({ id: 1 });

            await coachController.createCoach(req, res as Response);

            expect(statusMock).toHaveBeenCalledWith(200);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                message: "Coach created successfully",
            }));
        });
    });

    // -----------------------------
    // GET ALL COACH
    // -----------------------------
    describe("getAllCoach", () => {
        it("should return 404 if no records found", async () => {
            (prisma.coach.count as any).mockResolvedValue(0);
            (prisma.coach.findMany as any).mockResolvedValue([]);

            await coachController.getAllCoach(req as Request, res as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
        });

        it("should return 200 with items", async () => {
            (prisma.coach.count as any).mockResolvedValue(1);
            (prisma.coach.findMany as any).mockResolvedValue([{ id: 1 }]);

            await coachController.getAllCoach(req as Request, res as Response);

            expect(statusMock).toHaveBeenCalledWith(200);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    totalCount: 1,
                    items: expect.any(Array),
                }),
            }));
        });
    });

    // -----------------------------
    // GET COACH BY ID
    // -----------------------------
    describe("getCoachById", () => {
        it("should return 400 if ID is missing", async () => {
            req.params = {};

            await coachController.getCoachById(req as Request, res as Response);

            expect(statusMock).toHaveBeenCalledWith(400);
        });

        it("should return 404 if coach not found", async () => {
            req.params = { id: "1" };
            (prisma.coach.findUnique as any).mockResolvedValue(null);

            await coachController.getCoachById(req as Request, res as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
        });

        it("should return 200 with coach data", async () => {
            req.params = { id: "1" };
            (prisma.coach.findUnique as any).mockResolvedValue({ id: 1 });

            await coachController.getCoachById(req as Request, res as Response);

            expect(statusMock).toHaveBeenCalledWith(200);
        });
    });

    // -----------------------------
    // UPDATE COACH
    // -----------------------------
    describe("updateCoach", () => {
        it("should return 400 if ID is missing", async () => {
            req.params = {};
            await coachController.updateCoach(req as any, res as Response);

            expect(statusMock).toHaveBeenCalledWith(400);
        });

        it("should return 404 if coach not found", async () => {
            req.params = { id: "1" };
            (prisma.coach.findUnique as any).mockResolvedValue(null);

            await coachController.updateCoach(req as any, res as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
        });

        it("should update coach successfully", async () => {
            req.params = { id: "1" };
            req.body = { full_name: "Updated Name" };

            (prisma.coach.findUnique as any).mockResolvedValue({ id: 1 });
            (prisma.coach.update as any).mockResolvedValue({ id: 1 });

            await coachController.updateCoach(req as any, res as Response);

            expect(statusMock).toHaveBeenCalledWith(200);
        });
    });

    // -----------------------------
    // DELETE COACH
    // -----------------------------
    describe("deleteCoach", () => {
        it("should return 400 if ID is missing", async () => {
            req.params = {};

            await coachController.deleteCoach(req as Request, res as Response);

            expect(statusMock).toHaveBeenCalledWith(400);
        });

        it("should return 404 if delete failed", async () => {
            req.params = { id: "1" };
            (prisma.coach.update as any).mockResolvedValue(null);

            await coachController.deleteCoach(req as Request, res as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
        });

        it("should delete coach successfully", async () => {
            req.params = { id: "1" };
            (prisma.coach.update as any).mockResolvedValue({ id: 1, status: 2 });

            await coachController.deleteCoach(req as Request, res as Response);

            expect(statusMock).toHaveBeenCalledWith(200);
        });
    });

    // -----------------------------
    // ENABLE / DISABLE COACH
    //------------------------------
    describe("enableDisableCoach", () => {
        it("should return 400 if ID missing", async () => {
            req.params = {};
            req.body = { status: 1 };

            await coachController.enableDisableCoach(req as Request, res as Response);

            expect(statusMock).toHaveBeenCalledWith(400);
        });

        it("should return 404 if coach not found", async () => {
            req.params = { id: "1" };
            req.body = { status: 1 };
            (prisma.coach.findUnique as any).mockResolvedValue(null);

            await coachController.enableDisableCoach(req as Request, res as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
        });

        it("should update successfully", async () => {
            req.params = { id: "1" };
            req.body = { status: 1 };

            (prisma.coach.findUnique as any).mockResolvedValue({ id: 1 });
            (prisma.coach.update as any).mockResolvedValue({ id: 1, status: 1 });

            await coachController.enableDisableCoach(req as Request, res as Response);

            expect(statusMock).toHaveBeenCalledWith(200);
        });
    });

    // -----------------------------
    // APPROVE / REJECT COACH
    // -----------------------------
    describe("approveRejectCoach", () => {
        it("should return 400 if coach_id missing", async () => {
            req.body = { type: 0 };
            await coachController.approveRejectCoach(req as any, res as Response);

            expect(statusMock).toHaveBeenCalledWith(400);
        });

        it("should return 404 if coach not found", async () => {
            req.body = { coach_id: 1, type: 0 };
            (prisma.coach.findUnique as any).mockResolvedValue(null);

            await coachController.approveRejectCoach(req as any, res as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
        });

        // it("should approve coach successfully", async () => {
        //     req.body = { coach_id: 1, type: 0 };

        //     const mockCoach = { id: 1, email: "test@test.com", full_name: "Coach", user_id: 10 };

        //     (prisma.coach.findUnique as any).mockResolvedValue(mockCoach);

        //     stripe.customers.create.mockResolvedValue({ id: "cus_123" });
        //     stripe.paymentIntents.create.mockResolvedValue({
        //         id: "pi_123",
        //         client_secret: "secret"
        //     });

        //     (prisma.coach.update as any).mockResolvedValue({ ...mockCoach, is_approved: 1 });

        //     await coachController.approveRejectCoach(req as any, res as Response);

        //     expect(statusMock).toHaveBeenCalledWith(200);
        //     expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        //         message: "Coach approved successfully"
        //     }));
        // });


        it("should reject coach successfully", async () => {
            req.body = { coach_id: 1, type: 1, rejection_reason: "Reason" };

            const mockCoach = { id: 1, email: "test@test.com", full_name: "Coach" };
            (prisma.coach.findUnique as any).mockResolvedValue(mockCoach);

            (prisma.coach.update as any).mockResolvedValue({ ...mockCoach, is_approved: 2 });

            await coachController.approveRejectCoach(req as any, res as Response);

            expect(statusMock).toHaveBeenCalledWith(200);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                message: "Coach rejected successfully",
            }));
        });
    });
});
