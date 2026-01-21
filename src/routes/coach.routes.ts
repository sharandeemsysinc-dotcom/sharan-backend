import { Router } from "express";
import CoachController from "../controllers/coach.controller";
import { authenticate } from "../middlewares/authenticate";
import { upload } from "../middlewares/fileUpload";
import coachController from "../controllers/coach.controller";

const router = Router();

// Create Coach
router.post(
    "/create_coach",
    upload.fields([
        { name: "image_url", maxCount: 1 },
        { name: "upload_file_url", maxCount: 1 },
        { name: "acc_upload_file", maxCount: 1 },
        { name: "pcc_upload_file", maxCount: 1 },
        { name: "mcc_upload_file", maxCount: 1 },
        { name: "emcc_upload_file", maxCount: 1 },
        { name: "co_active_upload_file", maxCount: 1 },
        { name: "other_upload_file", maxCount: 1 },
    ]),
    CoachController.createCoach
);

// Get All Coach
router.post("/get_all_coach", authenticate(["Admin", "Staff", "Coach"]), CoachController.getAllCoach);

// Get Coach By Id
router.post("/get_coach_by_id", authenticate(["Admin", "Staff", "Coach"]), CoachController.getCoachById);

// Update Coach
router.put("/update_coach/:id", authenticate(["Admin", "Staff", "Coach"]),
    upload.fields([
        { name: "image_url", maxCount: 1 },
        { name: "upload_file_url", maxCount: 1 },
        { name: "acc_upload_file", maxCount: 1 },
        { name: "pcc_upload_file", maxCount: 1 },
        { name: "mcc_upload_file", maxCount: 1 },
        { name: "emcc_upload_file", maxCount: 1 },
        { name: "other_upload_file", maxCount: 1 },
    ]),
    CoachController.updateCoach);

// Delete By Coach Id
router.put("/delete_coach/:id", authenticate(["Admin", "Staff"]), CoachController.deleteCoach);

// Enable Diable By Coach Id
router.put("/enable_disable_coach/:id", authenticate(["Admin", "Staff"]), CoachController.enableDisableCoach);

// Get Coach Subscription History
router.post("/get_coach_subscription_histroy", authenticate(["Admin", "Staff", "Coach"]), coachController.getCoachSubscriptionHistory);

// Get Coach by map client
router.post("/map_client", authenticate(["Admin", "Staff"]), coachController.mapCoachWithClient);

// Assign Coach With client
router.post("/assign_coach_with_client", authenticate(["Admin", "Staff"]), coachController.assignCoaches);

// Get assigned coaches
router.post("/get_assigned_coach", authenticate(["Admin", "Staff"]), coachController.getAssignedCoaches);

// Un assigned coach
router.post("/unassigned_coach", authenticate(["Admin", "Staff"]), coachController.unassignedCoach);

// After delete to activate coach
router.post("/activate", authenticate(["Admin", "Staff"]), coachController.activateCoach);

// Approve / Reject By Coach Id
router.post("/approve_reject_coach", authenticate(["Admin", "Staff"]), CoachController.approveRejectCoach)

// Assign coach with static side
router.post("/assign_coach_static_site", authenticate(["Admin", "Staff"]), CoachController.assignCoachStaticPage);

// Calculate the final amount
router.post("/plan_final_amount", authenticate(["Coach"]), CoachController.calculateCoachPlanAmount);

// Create Initial Payment
router.post("/create_payment", authenticate(["Coach"]), CoachController.createInitialPaymentIntent);

// Update the card details
router.post("/update_card_details", authenticate(["Coach"]), CoachController.updateCoachCard);

// Recall the Client Secret
router.post("/get_client_secret", CoachController.callClientSecret);

// Checking route for auto renewal
router.post("/auto_renewal", CoachController.autoRenewalSubscription);



export default router;
