import { Router } from "express";
import Staff from "../controllers/staff.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Create Staff
router.post("/create_staff", authenticate(["Admin"]), Staff.createStaff);

// Get all Staff
router.post("/get_all_staff", authenticate(["Admin", "Staff"]), Staff.getAllAdminAndStaff);

// Get staff by Id
router.post("/get_staff_by_id", authenticate(["Admin", "Staff"]), Staff.getStaffById);

// Update Staff
router.put("/update_staff/:id", authenticate(["Admin"]), Staff.updateStaff);

// Delete Staff
router.put("/delete_staff/:id", authenticate(["Admin"]), Staff.deleteStaff);

// Enable Disable By Id
router.put("/enable_disable_staff/:id", authenticate(["Admin"]), Staff.enableDisableStaff);

export default router;
