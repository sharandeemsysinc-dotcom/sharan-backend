import { Router } from "express";
import { registerUser, createMember } from "../controllers/user.controller";
import { authenticate } from "../middlewares/authenticate";


const router = Router();

router.post("/createUser", registerUser);
router.post("/create_member", authenticate(["Admin"]), createMember);

export default router;
