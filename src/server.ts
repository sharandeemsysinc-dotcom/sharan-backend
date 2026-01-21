import dotenv from "dotenv";
dotenv.config();

import express from "express";
import morgan from "morgan";
import cors from "cors";
import bodyParser from "body-parser";
import errorHandler from "./middlewares/errorHandler";

import coachController from "../src/controllers/coach.controller";
import AuthController from "./controllers/auth.controller";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import adminRoutes from "./routes/admin.routes";
import staffRoutes from "./routes/staff.routes";
import subscriptionRoutes from "./routes/subcription.routes";
import coachRoutes from "./routes/coach.routes";
import feedbackRoutes from "./routes/feedback.routes";
import clientRoutes from "./routes/client.routes";
import workingHoursRoutes from "./routes/workingHours.routes";
import holiday from "./routes/holiday.routes";
import appointmentRoutes from "./routes/appointment.routes";
import coachRequestRoutes from "./routes/coachRequest.routes";
import settings from "./routes/settings.routes";

//  Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

app.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  coachController.handleStripeWebhook
);

//Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cors());
app.use(morgan("dev"));
app.use(express.static("public"));

// Routes
app.use("/auth", authRoutes);
app.use("/user", userRoutes)
app.use("/admin", adminRoutes);
app.use("/subscription", subscriptionRoutes);
app.use("/staff", staffRoutes);
app.use("/coach", coachRoutes);
app.use("/coachRequest", coachRequestRoutes);
app.use("/feedback", feedbackRoutes);
app.use("/client", clientRoutes);
app.use("/workingHours", workingHoursRoutes);
app.use("/holiday", holiday);
app.use("/appointment", appointmentRoutes);
app.use("/settings", settings);

app.get("/", (req, res) => {
  return res.status(200).json({
    status: true,
    statusCode: 200,
    message: "Server is running"
  });
});

// Global Error Handler
app.use(errorHandler);

import { initScheduler } from "./services/scheduler.service";

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.info(`Server running at http://localhost:${PORT}`);
  initScheduler();
});

export default app;
