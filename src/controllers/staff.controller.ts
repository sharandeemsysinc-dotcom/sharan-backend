import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { StaffModel, Staff } from "../models/staff";
import logger from "../utils/logger";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { successResponse, errorResponse } from "../utils/responseHandler";
import bcrypt from "bcryptjs";
import { sendEmail } from "../utils/sendMail";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

const component = "Staff Controller";

// Handle Async Wrapper
async function handle<T>(promise: Promise<T>): Promise<[any, T | undefined]> {
    try {
        const data = await promise;
        return [null, data];
    } catch (error) {
        return [error, undefined];
    }
}

// AWS S3 Config
const s3 = new S3Client({
    region: process.env.S3_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_S3_ACCESS_KEY!,
        secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY!,
    },
});

// Delete Aws
async function deleteFromS3(folder: string, fileName: string | null) {
    logger.info({ component }, "Delete file from AWS S3");

    if (!fileName) return;
    const fileKey = `${folder}/${fileName}`;
    const command = new DeleteObjectCommand({
        Bucket: process.env.PUBLIC_BUCKET_NAME!,
        Key: fileKey,
    });
    await s3.send(command);
}

// Calculate Base64 Size
function calculateBase64Size(base64String: string): number {
    const buffer = Buffer.from(base64String, "base64");
    return buffer.length / (1024 * 1024);
}

// Upload Profile Image to S3
async function profilePictureUpload({ id, image_url }: { id: string; image_url: string; }) {
    if (!image_url) {
        throw new Error("Image Base64 is required");
    }

    const parts = image_url.split(",");
    if (parts.length !== 2 || !parts[1]) {
        throw new Error("Invalid Base64 image format");
    }

    // Extract MIME
    const mimeMatch = parts[0]!.match(/data:(.*);base64/);
    if (!mimeMatch || !mimeMatch[1]) {
        throw new Error("Invalid image Base64 MIME type");
    }

    const mime = mimeMatch[1];
    const ext = mime.split("/")[1];

    const base64 = parts[1];
    const buffer = Buffer.from(base64, "base64");

    // S3 Key
    const Key = `web/doctors/${id}.${ext}`;

    // Upload file
    await s3.send(
        new PutObjectCommand({
            Bucket: process.env.PUBLIC_BUCKET_NAME!,
            Key,
            Body: buffer,
            ContentType: mime,
            ACL: "public-read",
        })
    );

    // Return only the ID (not URL, not full key)
    return { key: `${id}.${ext}` };
}

// Create Staff
async function createStaff(req: Request, res: Response) {
    logger.info({ component }, "Create Staff API Called", req.body);
    try {
        const { first_name, last_name, middle_name, country_code, email, mobile } = req.body;
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
            // Create USER
            const user = await tx.user.create({
                data: {
                    email,
                    user_name: first_name || "",
                    password_hash: hashedPassword,
                    role_id: 2,
                }
            });

            // Create STAFF
            let staff = await tx.staff.create({
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
            if (req.body.image_url && req.body.image_url.startsWith("data:image")) {
                const base64String = req.body.image_url.split(",")[1];
                const sizeMB = calculateBase64Size(base64String);

                if (sizeMB > 2) {
                    throw new Error("Image exceeds 2MB");
                }

                const uploaded = await profilePictureUpload({
                    id: staff.id,
                    image_url: req.body.image_url
                });

                // Save ONLY THE ID
                staff = await tx.staff.update({
                    where: { id: staff.id },
                    data: { image_url: uploaded.key }
                });
            }
            return { user, staff, rawPassword };
        });
        // // Send Email Notification
        // const htmlTemplate = `
        //        <h3>Welcome ${first_name || "Staff"}</h3>
        //         <p>Your staff account has been created.</p>
        //         <p><b>Email:</b> ${email}</p>
        //         <p><b>Password:</b> ${result.rawPassword}</p>
        //         <p>You can now log in using these credentials.</p>
        //     `;
        // //  RECEIVE SES RESPONSE
        // const mailResponse = await sendEmail({
        //     to: email,
        //     subject: "Your Staff Account Credentials",
        //     html: htmlTemplate,
        // });
        // //  CHECK SES RESULT
        // if (!mailResponse.success) {
        //     console.info(mailResponse);
        //     return errorResponse(
        //         res,
        //         500,
        //         `Failed to send temporary password email: ${mailResponse.error || mailResponse.message}`
        //     );
        // }
        return successResponse(res, 200, "Staff created successfully",
            {
                ...new StaffModel(result.staff)
            });

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}



// Get All Admin and Staff
export async function getAllAdminAndStaff(req: Request, res: Response) {
    logger.info({ component }, "Get All Admin and Staff API Called");
    try {
        const page = Number(req.body.page ?? 1);
        const limit = Number(req.body.itemPerPage ?? 10);
        const sortKey = req.body.sortKey ? String(req.body.sortKey) : "created_at";
        const sortOrder = req.body.sortOrder === "asc" ? "asc" : "desc";
        const search = req.body.search ? String(req.body.search).trim() : "";

        // WHERE condition for both
        const commonWhere: any = { status: { not: 2 } };

        if (search) {
            commonWhere.OR = [
                { first_name: { contains: search, mode: 'insensitive' } },
                { last_name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { mobile: { contains: search, mode: 'insensitive' } }
            ];
        }

        const admins = await prisma.admin.findMany({
            where: commonWhere,
            include: { user: { include: { role: true } } }
        });

        const staffList = await prisma.staff.findMany({
            where: commonWhere,
            include: { user: { include: { role: true } } }
        });

        // Combine and map
        let combined: any[] = [
            ...admins.map(a => ({ ...a, role: a.user?.role?.name || "admin" })),
            ...staffList.map(s => ({ ...s, role: s.user?.role?.name || "staff" }))
        ];

        // Fetch all potential creators to allow sorting by creator name
        const creatorIds = Array.from(new Set(combined.map(i => i.created_by).filter(Boolean)));
        const allCreators = await prisma.admin.findMany({
            where: { id: { in: creatorIds as string[] } },
            select: { id: true, first_name: true, middle_name: true, last_name: true }
        });

        combined = combined.map(item => {
            const creator = allCreators.find(a => a.id === item.created_by);
            const creatorName = creator ? [creator.first_name, creator.middle_name, creator.last_name].filter(Boolean).join(" ") : null;
            return {
                ...item,
                created_by_name: creatorName
            };
        });

        // Apply Sorting
        combined.sort((a, b) => {
            let valA: any;
            let valB: any;

            switch (sortKey) {
                case "role":
                    valA = a.role;
                    valB = b.role;
                    break;
                case "first_name":
                    valA = a.first_name || "";
                    valB = b.first_name || "";
                    break;
                case "email":
                    valA = a.email || "";
                    valB = b.email || "";
                    break;
                case "created_by":
                    valA = a.created_by_name || "";
                    valB = b.created_by_name || "";
                    break;
                case "created_at":
                default:
                    valA = new Date(a.created_at).getTime();
                    valB = new Date(b.created_at).getTime();
                    break;
            }

            if (valA < valB) return sortOrder === "asc" ? -1 : 1;
            if (valA > valB) return sortOrder === "asc" ? 1 : -1;
            return 0;
        });

        const totalCount = combined.length;

        // Apply pagination
        const startIndex = (page - 1) * limit;
        const pagedData = combined.slice(startIndex, startIndex + limit);

        const formattedItems = pagedData.map(item => {
            let image_url = item.image_url;
            if (image_url) {
                image_url = `${process.env.S3StorageLinkForimages}web/doctors/${image_url}`;
            }

            const { user, ...cleanItem } = item;
            return {
                ...cleanItem,
                image_url
            };
        });

        return successResponse(res, 200, "Admin and Staff fetched successfully", {
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            items: formattedItems
        });

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

//GET STAFF BY ID
async function getStaffById(req: Request, res: Response) {
    logger.info({ component }, "Get Staff By ID");
    try {
        let staffId = req.body.staff_id;
        const userRole = req.user?.role;

        // If user is a Staff, use their user_id to find their staff record
        if (userRole === "Staff") {
            const userId = req.user?.id;
            const [errStaff, staff] = await handle<Staff | null>(
                prisma.staff.findUnique({
                    where: { user_id: userId }
                })
            );

            if (errStaff) return errorResponse(res, 500, "Failed to fetch staff data");
            if (!staff) return errorResponse(res, 404, "Staff not found");

            if (staff.image_url) {
                staff.image_url = `${process.env.S3StorageLinkForimages}web/doctors/${staff.image_url}`;
            }

            return successResponse(res, 200, "Staff fetched successfully", new StaffModel(staff));
        }
        else {   // Admin 
            const [err, staff] = await handle<Staff | null>(
                prisma.staff.findUnique({
                    where: { id: staffId }
                }));

            if (err) return errorResponse(res, 500, "Failed to fetch staff data");
            if (!staff) return errorResponse(res, 404, "Staff not found");

            if (staff.image_url) {
                staff.image_url = `${process.env.S3StorageLinkForimages}web/doctors/${staff.image_url}`;
            }
            return successResponse(res, 200, "Staff fetched successfully", new StaffModel(staff));
        }

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// UPDATE STAFF
async function updateStaff(req: Request, res: Response) {
    logger.info({ component }, "Update Staff API Called", req.body);
    try {
        const id = req.params.id;
        if (!id) {
            return errorResponse(res, 400, "Staff ID is required");
        }
        const { first_name, last_name, middle_name, country_code, email, mobile, image_url, status } = req.body;
        let staffPayload: any = { first_name, last_name, middle_name, country_code, email, mobile, status };

        // Handle image update
        if (image_url && image_url.startsWith("data:image")) {
            const base64 = image_url.split(",")[1];
            const sizeMB = calculateBase64Size(base64);
            if (sizeMB > 2) {
                return errorResponse(res, 400, "Image exceeds 2MB");
            }
            const uploaded = await profilePictureUpload({
                id,
                image_url
            });
            staffPayload.image_url = uploaded.key;
        }
        const [err, updated] = await handle<Staff>(
            prisma.staff.update({
                where: { id },
                data: staffPayload
            })
        );
        if (err) {
            return errorResponse(res, 500, "Failed to update staff");
        }
        return successResponse(
            res,
            200,
            "Staff updated successfully",
            new StaffModel(updated!)
        );
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// DELETE STAFF
async function deleteStaff(req: Request, res: Response) {
    logger.info({ component }, "Delete Staff");
    try {
        const id = req.params.id;
        if (!id) {
            return errorResponse(res, 400, "Staff ID is required");
        }

        const staff = await prisma.staff.findUnique({
            where: { id }
        });

        if (!staff) {
            return errorResponse(res, 404, "Staff not found");
        }

        /* -------- DELETE IMAGE FROM S3 -------- */
        const folderName = "web/doctors";

        if (staff.image_url) {
            await deleteFromS3(folderName, staff.image_url);
        }
        const [err, deleted] = await handle(
            prisma.staff.update({
                where: { id },
                data: { status: 2 }
            })
        );
        if (err) {
            return errorResponse(res, 500, "Failed to delete staff");
        }
        if (!deleted) {
            return errorResponse(res, 404, "Staff not found");
        }
        return successResponse(res, 200, "Staff deleted successfully");
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

//ENABLE / DISABLE STAFF
async function enableDisableStaff(req: Request, res: Response) {
    logger.info({ component }, "Toggle Staff Status");
    try {
        const id = req.params.id;
        const { status } = req.body;
        if (!id) {
            return errorResponse(res, 400, "Staff ID is required");
        }
        if (status === undefined || status === null) {
            return errorResponse(res, 400, "Status is required (0 or 1)");
        }
        if (![0, 1].includes(Number(status))) {
            return errorResponse(res, 400, "Invalid status value, must be 0 or 1");
        }
        const staff = await prisma.staff.findUnique({ where: { id } });
        if (!staff) {
            return errorResponse(res, 404, "Staff not found");
        }
        // Update staff status
        const updated = await prisma.staff.update({
            where: { id },
            data: { status: Number(status) }
        });
        return successResponse(
            res,
            200,
            `Staff ${status == 1 ? "enabled" : "disabled"} successfully`,
            { id, status: Number(status) }
        );
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

export default {
    createStaff,
    getAllAdminAndStaff,
    getStaffById,
    updateStaff,
    deleteStaff,
    enableDisableStaff
};

