import { Router } from "express";
import workingHoursController from "../controllers/workingHours.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Get Working Hours by Id
router.get('/get_by_Id', authenticate(["Coach"]), workingHoursController.get_Working_Hours_by_coachId);

// Update Working Hours
router.post("/update_Working_Hour", authenticate(["Coach"]), workingHoursController.update_Working_Hours);

// Soft Delete Working Hours by Day -- Future Use
// router.post("/soft_Delete_Working_Hours_By_Day", authenticate(["Coach"]), workingHoursController.soft_Delete_Working_Hours_By_Day);

// Check Appointments for Day
router.post("/check_appointments_for_Day", authenticate(["Coach"]), workingHoursController.check_appointments_for_Day);

// Enable / Disable Session
router.post("/enable_Disable_Session", authenticate(["Coach"]), workingHoursController.enable_Disable_Session);

// Delete Session
router.post("/delete_Session", authenticate(["Coach"]), workingHoursController.delete_Session);

export default router;