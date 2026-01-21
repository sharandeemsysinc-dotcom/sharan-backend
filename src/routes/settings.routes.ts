import { Router } from "express";
import appointmentController from "../controllers/settings.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Save Settings
router.post("/save_settings", authenticate(["Admin", "Staff", "Coach"]), appointmentController.save_Settings);

export default router;