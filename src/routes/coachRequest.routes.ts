import { Router } from "express";
import coachRequestController from "../controllers/coachRequest.controller";

const router = Router();

router.post("/coachRequestbyClient", coachRequestController.coachRequest);

router.post("/getAllCoachRequest", coachRequestController.getAllCoachRequests);

router.get("/getCoachRequestbyId/:id", coachRequestController.getCoachRequestbyId)

router.post("/getRejectedList", coachRequestController.getRejectedClients);

export default router;