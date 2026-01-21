import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// MOCK MIDDLEWARES
vi.mock("../../middlewares/authenticate", () => ({
    authenticate: () => (req: any, res: any, next: any) => next(),
}));

vi.mock("../../middlewares/fileUpload", () => ({
    upload: {
        fields: vi.fn(() => (req: any, res: any, next: any) => next()),
    },
}));

// MOCK CONTROLLERS
vi.mock("../../controllers/coach.controller", () => {
    const mock = {
        createCoach: vi.fn((req, res) => res.json({ test: "createCoach-called" })),
        getAllCoach: vi.fn((req, res) => res.json({ test: "getAllCoach-called" })),
        getCoachById: vi.fn((req, res) =>
            res.json({ test: "getCoachById-called", id: req.params.id })
        ),
        updateCoach: vi.fn((req, res) =>
            res.json({ test: "updateCoach-called", id: req.params.id })
        ),
        deleteCoach: vi.fn((req, res) =>
            res.json({ test: "deleteCoach-called", id: req.params.id })
        ),
        enableDisableCoach: vi.fn((req, res) =>
            res.json({ test: "enableDisableCoach-called", id: req.params.id })
        ),
        approveRejectCoach: vi.fn((req, res) =>
            res.json({ test: "approveRejectCoach-called" })
        ),
    };

    return {
        ...mock,
        default: mock,   // ✅ ADD THIS
    };
});


// ⚠️ IMPORTANT FIX
import  CoachController from "../../controllers/coach.controller";


// Router Import
import router from "../../routes/coach.routes";

// EXPRESS APP
const app = express();
app.use(express.json());
app.use("/coach", router);

// TESTS
describe("Coach Routes Unit Tests", () => {
    beforeEach(() => vi.clearAllMocks());

    it("POST /coach/create_coach", async () => {
        const res = await request(app).post("/coach/create_coach").send({});
        expect(res.body.test).toBe("createCoach-called");
        expect(CoachController.createCoach).toHaveBeenCalledTimes(1);
    });

    it("POST /coach/get_all_coach", async () => {
        const res = await request(app).post("/coach/get_all_coach").send({});
        expect(res.body.test).toBe("getAllCoach-called");
        expect(CoachController.getAllCoach).toHaveBeenCalledTimes(1);
    });

    it("GET /coach/get_coach_by_id/:id", async () => {
        const res = await request(app).get("/coach/get_coach_by_id/123");
        expect(res.body.test).toBe("getCoachById-called");
        expect(res.body.id).toBe("123");
        expect(CoachController.getCoachById).toHaveBeenCalledTimes(1);
    });

    it("PUT /coach/update_coach/:id", async () => {
        const res = await request(app).put("/coach/update_coach/456").send({});
        expect(res.body.test).toBe("updateCoach-called");
        expect(res.body.id).toBe("456");
        expect(CoachController.updateCoach).toHaveBeenCalledTimes(1);
    });

    it("PUT /coach/delete_coach/:id", async () => {
        const res = await request(app).put("/coach/delete_coach/789");
        expect(res.body.test).toBe("deleteCoach-called");
        expect(res.body.id).toBe("789");
        expect(CoachController.deleteCoach).toHaveBeenCalledTimes(1);
    });

    it("PUT /coach/enable_disable_coach/:id", async () => {
        const res = await request(app).put("/coach/enable_disable_coach/101");
        expect(res.body.test).toBe("enableDisableCoach-called");
        expect(res.body.id).toBe("101");
        expect(CoachController.enableDisableCoach).toHaveBeenCalledTimes(1);
    });

    it("POST /coach/approve_reject_coach", async () => {
        const res = await request(app).post("/coach/approve_reject_coach").send({});
        expect(res.body.test).toBe("approveRejectCoach-called");
        expect(CoachController.approveRejectCoach).toHaveBeenCalledTimes(1);
    });
});
