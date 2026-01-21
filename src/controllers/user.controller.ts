import { Request, Response } from "express";
import AdminController from "./admin.controller";
import StaffController from "./staff.controller";
import { errorResponse } from "../utils/responseHandler";

// ... existing code ...

// Create Member (Admin or Staff)
export const createMember = async (req: Request, res: Response) => {
  try {
    const { role } = req.body;

    if (!role) {
      return errorResponse(res, 400, "Role is required (Admin or Staff)");
    }
    if (role === "admin") {
      return AdminController.createAdmin(req, res);
    } else if (role === "staff") {
      return StaffController.createStaff(req, res);
    } else {
      return errorResponse(res, 400, "Invalid role. Must be 'Admin' or 'Staff'");
    }
  } catch (error: any) {
    return errorResponse(res, 500, error.message);
  }
};

import prisma from "../config/prisma";
import bcrypt from "bcryptjs";

// Register / Create User
export const registerUser = async (req: Request, res: Response) => {
  try {
    const { email, password, user_name, phone, role_id } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password_hash: hashedPassword,
        user_name,
        phone,
        role_id,
      },
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: user,
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

// Get users list
export const getUsers = async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({ include: { role: true } });
    return res.status(200).json({ success: true, data: users });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
