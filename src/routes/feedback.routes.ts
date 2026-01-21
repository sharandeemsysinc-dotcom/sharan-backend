import { Router } from "express";
import FeedbackController from "../controllers/feedback.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Create Feedback
router.post("/create_feedback", authenticate(["Client"]), FeedbackController.createFeedback);

// Get All Feedback
router.post("/get_all_feedback", authenticate(["Admin", "Coach", "Staff"]), FeedbackController.getAllFeedback);

// Get Feedback By Id
router.get("/get_feedback_by_id/:id", authenticate(["Admin", "Staff", "Coach", "Client"]), FeedbackController.getFeedbackById);

// Get Feedback By Coach Id
// router.get("/get_feedback_by_coach/:coach_id", authenticate(["Admin", "Staff", "Coach"]), FeedbackController.getFeedbackByCoachId);

// Get Feedback By Client Id
// router.get("/get_feedback_by_client/:client_id", authenticate(["Admin", "Staff", "Client"]), FeedbackController.getFeedbackByClientId);

export default router;
