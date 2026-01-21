import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { errorResponse } from "../utils/responseHandler";

export function authenticate(allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return errorResponse(res, 401, "Authorization token missing");
            const token = authHeader.split(" ")[1];
            if (!token) return errorResponse(res, 401, "Invalid authorization header");
            const decoded: any = jwt.verify(token, process.env.JWT_ACCESS_SECRET!);
            req.user = decoded;
            const roleName = decoded.role;
            if (!roleName) {
                return errorResponse(res, 403, "Token missing role");
            }
            if (!allowedRoles.includes(roleName)) {
                return errorResponse(res, 403, "Access denied: Unauthorized role");
            }
            next();
        } catch (err) {
            return errorResponse(res, 401, "Invalid or expired token");
        }
    };
}

