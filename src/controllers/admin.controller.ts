import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import logger from "../utils/logger";
import { successResponse, errorResponse } from "../utils/responseHandler";
import bcrypt from "bcryptjs";
import { sendEmail } from "../utils/sendMail";
import { Admin, AdminModel } from "../models/admin";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const component = "Admin Controller";

// AWS S3 Config
const s3 = new S3Client({
    region: process.env.S3_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_S3_ACCESS_KEY!,
        secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY!,
    },
});

// Calculate Base64 Size
function calculateBase64Size(base64String: string): number {
    const buffer = Buffer.from(base64String, "base64");
    return buffer.length / (1024 * 1024);
}

// Upload Profile Image to S3
async function adminProfilePictureUpload({ id, image_url }: { id: string; image_url: string; }) {
    if (!image_url) {
        throw new Error("Image Base64 is required");
    }

    const parts = image_url.split(",");
    if (parts.length !== 2 || !parts[1]) {
        throw new Error("Invalid Base64 image format");
    }

    const mimeMatch = parts[0]!.match(/data:(.*);base64/);
    if (!mimeMatch || !mimeMatch[1]) {
        throw new Error("Invalid image Base64 MIME type");
    }

    const mime = mimeMatch[1];
    const ext = mime.split("/")[1];

    const base64 = parts[1];
    const buffer = Buffer.from(base64, "base64");

    const Key = `web/admins/${id}.${ext}`;

    await s3.send(
        new PutObjectCommand({
            Bucket: process.env.PUBLIC_BUCKET_NAME!,
            Key,
            Body: buffer,
            ContentType: mime,
            ACL: "public-read",
        })
    );

    return { key: `${id}.${ext}` };
}

// Handle Async Wrapper
async function handle<T>(promise: Promise<T>): Promise<[any, T | undefined]> {
    try {
        const data = await promise;
        return [null, data];
    } catch (error) {
        return [error, undefined];
    }
}

// Create Admin
export async function createAdmin(req: Request, res: Response) {
    logger.info({ component }, "Create Admin API Called", req.body);
    try {
        const { first_name, last_name, middle_name, email, country_code, mobile, image_url } = req.body;
        // Email validation
        if (!email) {
            return errorResponse(res, 400, "Email is required");
        }

        // Generate a password (everything before @)
        const rawPassword = email.split("@")[0];
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        const authUserId = (req as any).user?.id;
        let adminCreatorId = null;

        if (authUserId) {
            const adminRecord = await prisma.admin.findUnique({ where: { user_id: authUserId } });
            adminCreatorId = adminRecord?.id || null;
        }

        // Run everything in a transaction
        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // Check duplicate email
            const existingUser = await tx.user.findUnique({ where: { email } });
            if (existingUser) {
                throw new Error("Email already exists");
            }
            // Create USER (Role 1 = Admin)
            const user = await tx.user.create({
                data: {
                    email,
                    user_name: first_name || "Admin",
                    password_hash: hashedPassword,
                    role_id: 1,
                    is_active: true,
                    phone: mobile
                }
            });

            // Create ADMIN
            let admin = await tx.admin.create({
                data: {
                    user_id: user.id,
                    first_name,
                    last_name,
                    middle_name,
                    country_code,
                    email,
                    mobile,
                    created_by: adminCreatorId,
                    status: 1
                }
            });

            // Upload profile image if exists
            if (image_url && image_url.startsWith("data:image")) {
                const base64String = image_url.split(",")[1];
                const sizeMB = calculateBase64Size(base64String);

                if (sizeMB > 2) {
                    throw new Error("Image exceeds 2MB");
                }

                const uploaded = await adminProfilePictureUpload({
                    id: admin.id,
                    image_url
                });

                admin = await tx.admin.update({
                    where: { id: admin.id },
                    data: { image_url: uploaded.key }
                });
            }

            return { user, admin, rawPassword };
        });

        return successResponse(res, 200, "Admin created successfully", {
            admin: result.admin,
            user: result.user
        });

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// GET ADMIN BY ID
export async function getAdminById(req: Request, res: Response) {
    logger.info({ component }, "Get Admin By ID");
    try {
        let adminId = req.body.admin_id;
        const userRole = (req as any).user?.role;

        // If user is an Admin, use their user_id to find their admin record
        if (userRole === "Admin") {
            const userId = (req as any).user?.id;
            const [errAdmin, adminRecord] = await handle<Admin | null>(
                prisma.admin.findUnique({
                    where: { user_id: userId }
                })
            );

            if (errAdmin) return errorResponse(res, 500, "Failed to fetch admin data");
            if (!adminRecord) return errorResponse(res, 404, "Admin not found");

            // if (adminRecord.image_url) {
            //     adminRecord.image_url = `${process.env.S3StorageLinkForimages}web/admins/${adminRecord.image_url}`;
            // }

            return successResponse(res, 200, "Admin fetched successfully", new AdminModel(adminRecord));
        }
        else {
            // For non-admin roles, require admin_id in body
            if (!adminId) {
                return errorResponse(res, 400, "Admin ID is required");
            }

            const [err, admin] = await handle<Admin | null>(
                prisma.admin.findUnique({
                    where: { id: adminId }
                })
            );

            if (err) return errorResponse(res, 500, "Failed to fetch admin data");
            if (!admin) return errorResponse(res, 404, "Admin not found");

            // Append S3 URL to image if exists
            // if (admin.image_url) {
            //     admin.image_url = `${process.env.S3StorageLinkForimages}web/admins/${admin.image_url}`;
            // }

            return successResponse(res, 200, "Admin fetched successfully", new AdminModel(admin));
        }

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// UPDATE ADMIN
export async function updateAdmin(req: Request, res: Response) {
    logger.info({ component }, "Update Admin API Called", req.body);
    try {
        const id = req.params.id;
        if (!id) {
            return errorResponse(res, 400, "Admin ID is required");
        }

        const { first_name, last_name, middle_name, country_code, email, mobile, image_url, status, access_level } = req.body;
        let adminPayload: any = { first_name, last_name, middle_name, country_code, email, mobile, status, access_level };

        // Handle image update
        if (image_url && image_url.startsWith("data:image")) {
            const base64 = image_url.split(",")[1];
            const sizeMB = calculateBase64Size(base64);
            if (sizeMB > 2) {
                return errorResponse(res, 400, "Image exceeds 2MB");
            }
            const uploaded = await adminProfilePictureUpload({
                id,
                image_url
            });
            adminPayload.image_url = uploaded.key;
        }

        const [err, updated] = await handle<Admin>(
            prisma.admin.update({
                where: { id },
                data: adminPayload
            })
        );

        if (err) {
            return errorResponse(res, 500, "Failed to update admin");
        }

        return successResponse(
            res,
            200,
            "Admin updated successfully",
            new AdminModel(updated!)
        );
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}


export default {
    createAdmin,
    getAdminById,
    updateAdmin
};
