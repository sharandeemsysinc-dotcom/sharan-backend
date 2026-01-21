import { Router } from "express";
import holidayController from "../controllers/holiday.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Save Holiday
router.post("/save_Holiday", authenticate(["Coach"]), holidayController.save_Holiday);

// Update Holiday by Id
router.post("/update_Holiday/:id", authenticate(["Coach"]), holidayController.update_Holiday);

// Soft Delete Holiday by Id
router.post("/soft_Delete_Holiday/:id", authenticate(["Coach"]), holidayController.soft_Delete_Holiday);

// Get Holiday by Id
router.get('/get_Holdiday_by_Id/:id', authenticate(["Coach"]), holidayController.get_Holdiday_by_Id);

// Get all Holidays by CoachId
router.post("/get_All_Holidays_by_CoachId", authenticate(["Coach"]), holidayController.get_All_Holidays_by_CoachId);

// Check Appointments for Holiday
router.post("/check_appointments_for_Holiday", authenticate(["Coach"]), holidayController.check_aapointments_for_Holiday);

export default router;