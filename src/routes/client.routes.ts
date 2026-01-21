import { Router } from "express";
import ClientController from "../controllers/client.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Create Client
router.post("/create_client", ClientController.createClient);

// Get All Clients
router.post("/get_all_clients", authenticate(["Admin", "Staff", "Coach", "Client"]), ClientController.getAllClients);

// Get Client By Id
router.post("/get_client_by_id", authenticate(["Admin", "Staff", "Coach", "Client"]), ClientController.getClientById);

// Update Client
router.put("/update_client/:id", authenticate(["Admin", "Staff", "Coach"]), ClientController.updateClient);

// Delete By Client Id
router.put("/delete_client/:id", authenticate(["Admin", "Staff", "Coach"]), ClientController.deleteClient);

// Enable Disable By Client Id
router.put("/enable_disable_client/:id", authenticate(["Admin", "Staff", "Coach"]), ClientController.enableDisableClient);

//Get clients for particular coach
router.post("/get_clients_for_coach", authenticate(["Admin", "Staff", "Coach"]), ClientController.getClientsForCoach);

// Get coaches for particular client
router.post("/get_coaches_for_client", authenticate(["Admin", "Staff", "Client"]), ClientController.getCoachesForClient);

// Get all Client History
router.post("/get_all_client_history", authenticate(["Client"]), ClientController.getAllClients_History);

// Get all Client Payment History
router.post("/get_all_client_payment_history", ClientController.getAllClientsPaymentHistory);

export default router;
