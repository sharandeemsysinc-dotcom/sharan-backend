import { Router } from "express";
import SubscriptionController from "../controllers/subscription.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Create Subscription
router.post("/create_subscription", authenticate(["Admin"]), SubscriptionController.createSubscriptionPlan);

// Get all Subscription
router.post("/get_all_subscription", authenticate(["Admin"]), SubscriptionController.getAllSubscription);

// Get subscription by Id
router.get("/get_subscription_by_id/:id", authenticate(["Admin"]), SubscriptionController.getSubscriptionPlanById)

// Update Subcription
router.put("/update_subscription/:id", authenticate(["Admin"]), SubscriptionController.updateSubscriptionPlan);

// Delete Subscription
router.put("/delete_subscription/:id", authenticate(["Admin"]), SubscriptionController.deleteSubscriptionPlan);

// Enable / Disable Subscription
router.put("/enable_disable_subscription/:id", authenticate(["Admin"]), SubscriptionController.enableDisableSubscription);

export default router;
