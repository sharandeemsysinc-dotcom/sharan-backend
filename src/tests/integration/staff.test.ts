
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// MOCK PRISMA (must be hoisted before imports)
vi.mock("../../config/prisma", () => {
    const user = {
        findUnique: vi.fn(),
        create: vi.fn(),
    };

    const staff = {
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
    };

    return {
        default: {
            user,
            staff,

            // Same references for tx.user / tx.staff
            $transaction: vi.fn(async (cb) => {
                return await cb({
                    user,
                    staff
                });
            })
        }
    };
});

// MOCK AUTH MIDDLEWARE (skip login)
vi.mock("../../middlewares/authenticate", () => ({
    authenticate: () => (_req: any, _res: any, next: any) => next(),
}));

// MOCK S3 UPLOAD + BASE64 SIZE (used by real controller)
vi.mock("../../controllers/staff.controller", async (importActual) => {
    const actual = await importActual() as Record<string, any>;

    return {
        ...actual, // keep updateStaff, deleteStaff, enableDisableStaff, etc.

        // ONLY override helper functions
        profilePictureUpload: vi.fn().mockResolvedValue({
            image_url: "https://mock-s3/image.png",
            awsResponse: { $metadata: {} }
        }),

        calculateBase64Size: vi.fn().mockReturnValue(1)
    };
});

// MOCK EMAIL BEFORE IMPORTING app
vi.mock("../../utils/sendMail", () => ({
    sendEmail: vi.fn().mockResolvedValue({
        success: true,
        message: "Email sent",
        smtp_status: "OK",
        messageId: "m1",
        httpStatus: 200
    }),
}));

//  Now import app + prisma AFTER mocks

import prisma from "../../config/prisma";
import app from "../../server";

// Helper
const mock = (fn: any) => vi.mocked(fn);

// TEST SUITE
describe("Staff Controller Test Suite", () => {

    beforeEach(() => vi.clearAllMocks());

    // CREATE STAFF (SUCCESS)
    it("POST /staff/create_staff → should create staff successfully", async () => {
        // First, let's debug what's actually happening
        mock(prisma.user.findUnique).mockResolvedValue(null);

        mock(prisma.user.create).mockResolvedValue({
            id: "u1",
            email: "staff@example.com",
            user_name: "Staff",
            password_hash: "hashed123",
            role_id: 2,
            status: 1, // Add status if required
            created_at: new Date(), // Add timestamps if required
            updated_at: new Date(),
        });

        mock(prisma.staff.create).mockResolvedValue({
            id: "s1",
            user_id: "u1",
            name: "Staff",
            email: "staff@example.com",
            mobile: "999",
            status: 1,
            image_url: null,
            created_at: new Date(), // Add timestamps if required
            updated_at: new Date(),
        });

        mock(prisma.staff.update).mockResolvedValue({
            id: "s1",
            user_id: "u1",
            name: "Staff",
            email: "staff@example.com",
            mobile: "999",
            status: 1,
            image_url: "profile123.png",
            created_at: new Date(),
            updated_at: new Date(),
        });

        const res = await request(app)
            .post("/staff/create_staff")
            .send({
                name: "Staff",
                email: "staff@example.com",
                image_url: "data:image/png;base64,xxx"
            });

        // Debug the actual error
        console.log("CREATE STAFF ERROR DETAILS:", {
            status: res.status,
            body: res.body
        });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Staff created successfully");
    });

    // CREATE STAFF - EMAIL EXISTS
    it("POST /staff/create_staff → should fail if email exists", async () => {

        mock(prisma.user.findUnique).mockResolvedValue({ id: "u1" });

        const res = await request(app)
            .post("/staff/create_staff")
            .send({ name: "Staff", email: "staff@example.com" });

        expect(res.status).toBe(500);
        expect(res.body.message).toBe("Email already exists");
    });

    // CREATE STAFF - MISSING EMAIL
    it("POST /staff/create_staff → should fail if email missing", async () => {

        const res = await request(app)
            .post("/staff/create_staff")
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Email is required");
    });

    // GET ALL STAFF
    it("POST /staff/get_all_staff → should return staff list", async () => {

        mock(prisma.staff.count).mockResolvedValue(1);

        mock(prisma.staff.findMany).mockResolvedValue([
            { id: "s1", email: "s@example.com", image_url: null }
        ]);

        const res = await request(app)
            .post("/staff/get_all_staff")
            .send({ page: 1, itemPerPage: 10 });

        expect(res.status).toBe(200);
        expect(res.body.data.totalCount).toBe(1);
        expect(res.body.data.items.length).toBe(1);
    });

    // GET STAFF BY ID - FIXED: Mock complete staff object with required relations
    it("GET /staff/get_staff_by_id/:id → should return staff", async () => {
        mock(prisma.staff.findUnique).mockResolvedValue({
            id: "s1",
            user_id: "u1",
            name: "Test Staff",
            email: "s@example.com",
            mobile: "1234567890",
            image_url: null,
            status: 1,
            created_at: new Date(),
            updated_at: new Date(),
            // Add user relation if your controller expects it
            user: {
                id: "u1",
                email: "s@example.com",
                user_name: "teststaff",
                role_id: 2,
                status: 1,
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        const res = await request(app).get("/staff/get_staff_by_id/s1");

        console.log("Get staff by ID response:", {
            status: res.status,
            body: res.body,
            error: res.body.error // Check if there's an error message
        });

        expect(res.status).toBe(200);
        expect(res.body.data.email).toBe("s@example.com");
    });

    it("GET /staff/get_staff_by_id/:id → should return 404", async () => {
        mock(prisma.staff.findUnique).mockResolvedValue(null);

        const res = await request(app).get("/staff/get_staff_by_id/xxx");

        expect(res.status).toBe(404);
    });

    // UPDATE STAFF
    it("PUT /staff/update_staff/:id → should update staff", async () => {

        mock(prisma.staff.update).mockResolvedValue({
            id: "s1",
            email: "updated@example.com",
            name: "Updated",
            mobile: "000",
            status: 1
        });

        const res = await request(app)
            .put("/staff/update_staff/s1")
            .send({ name: "Updated" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Staff updated successfully");
    });

    // DELETE STAFF
    it("PUT /staff/delete_staff/:id → should soft delete staff", async () => {

        mock(prisma.staff.update).mockResolvedValue({
            id: "s1",
            status: 2
        });

        const res = await request(app).put("/staff/delete_staff/s1");

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Staff deleted successfully");
    });

    // ENABLE / DISABLE STAFF
    it("PUT /staff/enable_disable_staff/:id → should enable staff", async () => {

        mock(prisma.staff.findUnique).mockResolvedValue({ id: "s1", status: 0 });

        mock(prisma.staff.update).mockResolvedValue({ id: "s1", status: 1 });

        const res = await request(app)
            .put("/staff/enable_disable_staff/s1")
            .send({ status: 1 });

        expect(res.status).toBe(200);
        expect(res.body.message).toContain("enabled");
    });

    it("PUT /staff/enable_disable_staff/:id → should fail for invalid status", async () => {

        const res = await request(app)
            .put("/staff/enable_disable_staff/s1")
            .send({ status: 5 });

        expect(res.status).toBe(400);
    });

});
