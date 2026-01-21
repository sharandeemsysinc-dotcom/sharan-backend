import { Router } from "express";
import Admin from "../controllers/admin.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Create Admin
router.post("/create_admin", authenticate(["Admin"]), Admin.createAdmin);

// Get Admin by Id
router.post("/get_admin_by_id", authenticate(["Admin", "Staff"]), Admin.getAdminById);

// Update Admin
router.put("/update_admin/:id", authenticate(["Admin"]), Admin.updateAdmin);

export default router;
