import { Router } from "express";
import appointmentController from "../controllers/appointment.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Create Appointment - Single
router.post("/create_Appointment_Single", authenticate(["Admin", "Staff", "Coach", "Client"]), appointmentController.createAppointment_Single);

// Create Appointment - Multiple
router.post("/create_Appointment_Multiple", authenticate(["Admin", "Staff", "Coach", "Client"]), appointmentController.createAppointment_Multiple);

// Gett All Appointments
router.post("/get_all_appointments", authenticate(["Admin", "Staff", "Coach", "Client"]), appointmentController.getAllAppointments);

// Get Appointment By ID
router.get("/get_appointment_by_id/:id", authenticate(["Admin", "Staff", "Coach", "Client"]), appointmentController.getAppointmentById);

// Reschedule Single Appointment
// router.post("/reschedule/single_Appointment", authenticate(["Admin", "Staff", "Coach", "Client"]), appointmentController.edit_Appointment_Single);

// Reschedule Multiple Appointment
router.post("/edit/appointments", authenticate(["Admin", "Staff", "Coach", "Client"]), appointmentController.edit_Appointment);

// Approve Appointment
router.put("/approve_appointment/:id", authenticate(["Admin", "Staff", "Coach", "Client"]), appointmentController.approveAppointment);

// Get Coach Available Slots
router.post("/available_slots", authenticate(["Admin", "Staff", "Coach", "Client"]), appointmentController.getCoachSlots);

// Cancel Single Appointment
router.post("/cancel_Appointment", authenticate(["Admin", "Staff", "Coach", "Client"]), appointmentController.cancelAppointment);

// Cancel Multiple Appointment
// router.put("/cancel_Multiple_Appointment", authenticate(["Admin", "Staff", "Coach", "Client"]), appointmentController.cancel_Multiple_Appointments);

export default router;