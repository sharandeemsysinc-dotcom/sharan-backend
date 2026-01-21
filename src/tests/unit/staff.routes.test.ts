import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// 1. MOCK AUTH MIDDLEWARE
vi.mock("../../middlewares/authenticate", () => ({
    authenticate: () => (req: any, res: any, next: any) => next(),
}));

// 2. MOCK CONTROLLERS - Define mock inside vi.mock
vi.mock("../../controllers/staff.controller", () => {
    const mock = {
        createStaff: vi.fn((req, res) => res.json({ test: "createStaff-called" })),
        // getAllStaff: vi.fn((req, res) => res.json({ test: "getAllStaff-called" })),
        getStaffById: vi.fn((req, res) =>
            res.json({ test: "getStaffById-called", id: req.params.id })
        ),
        updateStaff: vi.fn((req, res) =>
            res.json({ test: "updateStaff-called", id: req.params.id })
        ),
        deleteStaff: vi.fn((req, res) =>
            res.json({ test: "deleteStaff-called", id: req.params.id })
        ),
        enableDisableStaff: vi.fn((req, res) =>
            res.json({
                test: "enableDisableStaff-called",
                id: req.params.id,
                status: req.body.status   // << ADD THIS
            })
        ),

    };

    return {
        ...mock,
        default: mock, // << IMPORTANT
    };
});


// IMPORT ROUTER (AFTER MOCKS)
import router from "../../routes/staff.routes";

// IMPORT MOCKED CONTROLLERS FOR ASSERTIONS
import staffController from "../../controllers/staff.controller";

const app = express();
app.use(express.json());
app.use("/staff", router);

// TESTS
describe("Staff Routes Unit Tests", () => {
    beforeEach(() => vi.clearAllMocks());

    it("POST /staff/create_staff", async () => {
        const res = await request(app).post("/staff/create_staff").send({});
        expect(res.body.test).toBe("createStaff-called");
        expect(staffController.createStaff).toHaveBeenCalled();
    });

    // it("POST /staff/get_all_staff", async () => {
    //     const res = await request(app).post("/staff/get_all_staff").send({});
    //     expect(res.body.test).toBe("getAllStaff-called");
    //     expect(staffController.getAllStaff).toHaveBeenCalled();
    // });

    it("GET /staff/get_staff_by_id/:id", async () => {
        const res = await request(app).get("/staff/get_staff_by_id/555");
        expect(res.body.id).toBe("555");
        expect(staffController.getStaffById).toHaveBeenCalled();
    });

    it("PUT /staff/update_staff/:id", async () => {
        const res = await request(app).put("/staff/update_staff/777").send({});
        expect(res.body.id).toBe("777");
        expect(staffController.updateStaff).toHaveBeenCalled();
    });

    it("PUT /staff/delete_staff/:id", async () => {
        const res = await request(app).put("/staff/delete_staff/999");
        expect(res.body.id).toBe("999");
        expect(staffController.deleteStaff).toHaveBeenCalled();
    });

    it("PUT /staff/enable_disable_staff/:id", async () => {
        const res = await request(app)
            .put("/staff/enable_disable_staff/321")
            .send({ status: 1 });

        expect(res.body.id).toBe("321");
        expect(res.body.status).toBe(1);
        expect(staffController.enableDisableStaff).toHaveBeenCalled();
    });
});