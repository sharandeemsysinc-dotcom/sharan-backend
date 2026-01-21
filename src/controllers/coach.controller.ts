import { Request, Response } from "express";
import prisma from "../config/prisma";
import { coachModel } from "../models/coach";
import logger from "../utils/logger";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { successResponse, errorResponse } from "../utils/responseHandler";
import bcrypt from "bcryptjs";
import { sendEmail } from "../utils/sendMail";
import { UploadedFile } from "../types/express/file.type";
import { stripe } from "../config/stripe";
import Stripe from "stripe";

// TS FIX IMPORTS
import { Coach, Prisma } from "@prisma/client";

const component = "Coach Controller";

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

// Upload the file
async function uploadToS3WithName(
    file: UploadedFile,
    folder: string,
    fileNameWithoutExt: string
) {
    const ext = file.originalname.split(".").pop();
    const finalFileName = `${fileNameWithoutExt}.${ext}`;

    const fileKey = `${folder}/${finalFileName}`;

    const command = new PutObjectCommand({
        Bucket: process.env.PUBLIC_BUCKET_NAME!,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: "public-read",
    });

    await s3.send(command);
    return finalFileName;
}

// Delete Aws
async function deleteFromS3(folder: string, fileName: string) {
    logger.info({ component }, "Delete file in AWS")
    if (!fileName) return;
    const fileKey = `${folder}/${fileName}`;
    const command = new DeleteObjectCommand({
        Bucket: process.env.PUBLIC_BUCKET_NAME!,
        Key: fileKey,
    });
    await s3.send(command);
}

// Parse Form Data
export function parseFormData(
    body: any,
    arrayFields: string[],
    numberFields: string[]
): Record<string, any> {
    const parsed: Record<string, any> = {};

    for (const key in body) {
        const value = body[key];

        if (arrayFields.includes(key)) {
            try {
                parsed[key] = JSON.parse(value);
            } catch {
                parsed[key] = String(value)
                    .split(",")
                    .map(v => v.trim());
            }
        } else if (numberFields.includes(key)) {
            parsed[key] = Number(value);
        } else {
            parsed[key] = value;
        }
    }

    return parsed;
}

// Validate File Type
function validateFileType(file: UploadedFile, allowedTypes: string[]) {
    const extension = file.originalname.split(".").pop()?.toLowerCase();
    if (!extension || !allowedTypes.includes(extension)) {
        throw new Error(`Invalid file type: .${extension}. Allowed types: ${allowedTypes.join(", ")}`);
    }
}

// Validate File Size
function validateFileSize(file: UploadedFile, maxSizeMB: number) {
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
        throw new Error(`File size exceeds ${maxSizeMB}MB limit`);
    }
}

// Create Coach
async function createCoach(req: any, res: Response) {
    logger.info({ component }, "Create Coach");

    try {
        const { body, files } = req;

        const email = body.email;
        const name = body.first_name;

        if (!email) return errorResponse(res, 400, "Email is required");

        const rawPassword = email.split("@")[0];
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        const image = files["image_url"]?.[0];
        const upload = files["upload_file_url"]?.[0];

        const accFile = files?.["acc_upload_file"]?.[0] || null;
        const pccFile = files?.["pcc_upload_file"]?.[0] || null;
        const mccFile = files?.["mcc_upload_file"]?.[0] || null;
        const emccFile = files?.["emcc_upload_file"]?.[0] || null;
        const coactiveFile = files?.["co_active_upload_file"]?.[0] || null;
        const otherFile = files?.["other_upload_file"]?.[0] || null;

        if (image) {
            validateFileType(image, ["png", "jpg", "jpeg"]);
            validateFileSize(image, 2);
        }

        const pdfFiles = [upload, accFile, pccFile, mccFile, emccFile, coactiveFile, otherFile];

        for (const file of pdfFiles) {
            if (file) {
                validateFileType(file, ["pdf"]);
                validateFileSize(file, 2);
            }
        }

        const arrayFields = [
            "coaching_credentials", "industries", "leadership_levels",
            "coaching_style", "clients_situation", "session_rates"
        ];

        const numberFields = ["coaching_hours"];
        const parsedBody = parseFormData(body, arrayFields, numberFields);

        // FIX: Type tx properly
        const { coach } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {

            const existingUser = await tx.user.findUnique({ where: { email } });
            if (existingUser) throw new Error("Email already exists");

            const user = await tx.user.create({
                data: {
                    email,
                    user_name: name,
                    password_hash: hashedPassword,
                    role_id: 3,
                    status: 0
                }
            });

            const coach = await tx.coach.create({
                data: {
                    user_id: user.id,
                    first_name: parsedBody.first_name,
                    middle_name: parsedBody.middle_name ?? null,
                    last_name: parsedBody.last_name ?? null,
                    email: parsedBody.email,
                    mobile: parsedBody.mobile ?? "",
                    linked_url: parsedBody.linked_url,
                    website: parsedBody.website,
                    timezone: parsedBody.timezone,
                    country_code: parsedBody.country_code ?? null,
                    
                    terms_conditions: parsedBody.terms_conditions === "true"
                        ? true
                        : parsedBody.terms_conditions === "false"
                            ? false
                            : null,

                    // JSON FIELDS
                    coaching_credentials: parsedBody.coaching_credentials,
                    other_coaching_credentials: parsedBody.other_coaching_credentials ?? null,

                    coaching_hours: parsedBody.coaching_hours,
                    coaching_experience: parsedBody.coaching_experience ?? null,

                    industries: parsedBody.industries,
                    other_industries: parsedBody.other_industries ?? null,

                    leadership_levels: parsedBody.leadership_levels,

                    coaching_topics: parsedBody.coaching_topics ?? null,
                    coaching_style: parsedBody.coaching_style,

                    other_coaching_style: parsedBody.other_coaching_style ?? null,

                    coaching_philosophy: parsedBody.coaching_philosophy ?? null,
                    coaching_strength: parsedBody.coaching_strength,
                    preferred_client: parsedBody.preferred_client,

                    clients_situation: parsedBody.clients_situation,
                    other_clients_situation: parsedBody.other_clients_situation ?? null,

                    coaching_boundaries: parsedBody.coaching_boundaries ?? null,
                    // connecting_coaches: parsedBody.connecting_coaches ?? null,
                    connecting_coaches:
                        parsedBody.connecting_coaches !== undefined &&
                            parsedBody.connecting_coaches !== null
                            ? Number(parsedBody.connecting_coaches)
                            : null,
                    connecting_other_coaches: parsedBody.connecting_other_coaches ?? null,
                    anything: parsedBody.anything ?? null,
                    bio: parsedBody.bio ?? null,

                    session_rates: parsedBody.session_rates,
                    current_subscription_id: parsedBody.current_subscription_id ?? null,
                    current_subscription_type_id: parsedBody.current_subscription_type_id ?? null,

                    // OPTIONAL FILE FIELDS
                    image_url: null,
                    upload_file_url: null,
                    acc_upload_file: null,
                    pcc_upload_file: null,
                    mcc_upload_file: null,
                    emcc_upload_file: null,
                    co_active_upload_file: null,
                    other_upload_file: null,

                    // APPROVAL & STATUS
                    status: 0,
                    is_approved: 0,
                }
            });

            return { coach };
        });

        const folder = "web/doctors";

        const uploads: any = {};

        if (image)
            uploads.image_url = await uploadToS3WithName(image, folder, coach.id);

        if (upload)
            uploads.upload_file_url = await uploadToS3WithName(upload, folder, coach.id);

        if (accFile)
            uploads.acc_upload_file = await uploadToS3WithName(accFile, folder, coach.id);

        if (pccFile)
            uploads.pcc_upload_file = await uploadToS3WithName(pccFile, folder, coach.id);

        if (mccFile)
            uploads.mcc_upload_file = await uploadToS3WithName(mccFile, folder, coach.id);

        if (emccFile)
            uploads.emcc_upload_file = await uploadToS3WithName(emccFile, folder, coach.id);

        if (coactiveFile)
            uploads.co_active_upload_file = await uploadToS3WithName(coactiveFile, folder, coach.id)

        if (otherFile)
            uploads.other_upload_file = await uploadToS3WithName(otherFile, folder, coach.id)

        const updatedCoach = await prisma.coach.update({
            where: { id: coach.id },
            data: uploads
        });

        return successResponse(res, 200, "Coach registered successfully and mail sent to the coach", {
            coach: updatedCoach
        });

    } catch (error: any) {
        logger.error({ component }, error);
        return errorResponse(res, 500, error.message);
    }
}

// Get All Coach
async function getAllCoach(req: Request, res: Response) {
    logger.info({ component }, "Get All Coach");

    try {
        const page = Number(req.body.page ?? 0);
        const itemPerPage = Number(req.body.itemPerPage ?? 0);
        const search = req.body.search ?? "";
        const isPaidFilter = req.body.is_paid; // <-- NEW
        const inactive = Boolean(req.body.inactive === true || req.body.inactive === "true");

        const noPagination = !page || !itemPerPage;
        const noSearch = !search || search.trim() === "";

        const where: any = {};
        if (inactive) {     // Inactive coach
            where.OR = [
                // { status: 2 },
                { is_approved: 2 }
            ];
        }
        else {
            where.is_approved = { not: 0 };
        }

        // Role-based filtering
        const userRole = req.user?.role;
        if (userRole === "Coach") {
            // Coach can only see their own record
            const userId = req.user?.id;
            where.user_id = userId;
        }

        if (req.body.is_approve !== undefined && req.body.is_approve !== null) {
            where.is_approved = Number(req.body.is_approve);
        }

        if (!noSearch) {
            where.OR = [
                { first_name: { contains: search, mode: "insensitive" } },
                { last_name: { contains: search, mode: "insensitive" } },
                { middle_name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { mobile: { contains: search, mode: "insensitive" } },
                { coaching_experience: { contains: search, mode: "insensitive" } },
                { linked_url: { contains: search, mode: "insensitive" } }
                // {
                //     industries: {
                //         hasSome: [search.toLowerCase()]
                //     }
                // }
            ];
        }

        const [countErr, totalCount] = await handle(
            prisma.coach.count({ where })
        );


        const query: any = { where, orderBy: { created_at: "desc" } };

        if (!noPagination) {
            query.skip = (page - 1) * itemPerPage;
            query.take = itemPerPage;
        }

        // FIX: items typed as Coach[]
        const [err, items] = await handle<Coach[]>(
            prisma.coach.findMany(query)
        );

        if (!items || items.length === 0) {
            return res.status(200).json({
                status: true,
                statusCode: 200,
                data: [],
                message: "No records found"
            });
        }

        const coachIds = items.map(c => c.id);

        const payments = await prisma.payments.findMany({
            where: {
                coach_id: { in: coachIds }
            }
        });

        // Convert payments into a lookup map
        const paymentMap: any = {};
        payments.forEach(p => {
            paymentMap[p.coach_id] = p.is_paid;
        });

        let filteredItems = items;

        if (isPaidFilter !== undefined && isPaidFilter !== null) {
            filteredItems = items.filter(c => {
                const payStatus = paymentMap[c.id] ?? 0;
                return payStatus === Number(isPaidFilter);
            });

            if (!filteredItems || filteredItems.length === 0) {
                return res.status(200).json({
                    status: true,
                    statusCode: 200,
                    data: [],
                    message: "No records found"
                });
            }
        }



        const finalItems = await Promise.all(
            filteredItems.map(async (c: any) => {

                const appt = await prisma.appointment.findFirst({
                    where: { coach_id: c.id },
                    orderBy: { created_at: "desc" }  // latest appointment
                });

                if (c.image_url) {
                    c.image_url = `${process.env.S3StorageLinkForimages}web/doctors/${c.image_url}`;
                }
                if (c.upload_file_url) {
                    c.upload_file_url = `${process.env.S3StorageLinkForimages}web/doctors/${c.upload_file_url}`;
                }
                if (c.acc_upload_file) {
                    c.acc_upload_file = `${process.env.S3StorageLinkForimages}web/doctors/${c.acc_upload_file}`;
                }
                if (c.pcc_upload_file) {
                    c.pcc_upload_file = `${process.env.S3StorageLinkForimages}web/doctors/${c.pcc_upload_file}`;
                }
                if (c.mcc_upload_file) {
                    c.mcc_upload_file = `${process.env.S3StorageLinkForimages}web/doctors/${c.mcc_upload_file}`;
                }
                if (c.emcc_upload_file) {
                    c.emcc_upload_file = `${process.env.S3StorageLinkForimages}web/doctors/${c.emcc_upload_file}`;
                }
                if (c.co_active_upload_file) {
                    c.co_active_upload_file = `${process.env.S3StorageLinkForimages}web/doctors/${c.co_active_upload_file}`;
                }
                if (c.other_upload_file) {
                    c.other_upload_file = `${process.env.S3StorageLinkForimages}web/doctors/${c.other_upload_file}`;
                }

                return {
                    ...c,
                    appointment_date: appt?.end_date ?? null,
                    is_paid: paymentMap[c.id] ?? 0   // <-- ADD PAYMENT STATUS

                };
            })
        );

        return successResponse(res, 200, "Get all coach successfully", {
            totalCount,
            items: finalItems
        });

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Get Coach By ID
async function getCoachById(req: Request, res: Response) {
    logger.info({ component }, "Get Coach By ID");

    try {
        let coach_id = req.body.coach_id
        const userRole = req.user?.role;

        // If user is a Coach, use their user_id to find their coach record
        if (userRole === "Coach") {
            const userId = req.user?.id;
            const [errCoach, coach] = await handle<Coach | null>(
                prisma.coach.findUnique({ where: { user_id: userId } })
            );

            if (!coach) return errorResponse(res, 200, "Coach not found");

            const base = process.env.S3StorageLinkForimages;

            if (coach.image_url) {
                coach.image_url = `${base}web/doctors/${coach.image_url}`;
            }
            if (coach.upload_file_url) {
                coach.upload_file_url = `${base}web/doctors/${coach.upload_file_url}`;
            }
            if (coach.acc_upload_file) {
                coach.acc_upload_file = `${base}web/doctors/${coach.acc_upload_file}`;
            }
            if (coach.pcc_upload_file) {
                coach.pcc_upload_file = `${base}web/doctors/${coach.pcc_upload_file}`;
            }
            if (coach.mcc_upload_file) {
                coach.mcc_upload_file = `${base}web/doctors/${coach.mcc_upload_file}`;
            }
            if (coach.emcc_upload_file) {
                coach.emcc_upload_file = `${base}web/doctors/${coach.emcc_upload_file}`;
            }
            if (coach.co_active_upload_file) {
                coach.co_active_upload_file = `${base}web/doctors/${coach.co_active_upload_file}`;
            }
            if (coach.other_upload_file) {
                coach.other_upload_file = `${base}web/doctors/${coach.other_upload_file}`;
            }

            return successResponse(res, 200, "Get coach by Id successfully", coach);
        }
        else {   // Admin , Staff
            const [err, coach] = await handle<Coach | null>(
                prisma.coach.findUnique({ where: { id: coach_id } })
            );


            if (!coach) return errorResponse(res, 200, "Coach not found");

            const base = process.env.S3StorageLinkForimages;

            if (coach.image_url) {
                coach.image_url = `${base}web/doctors/${coach.image_url}`;
            }
            if (coach.upload_file_url) {
                coach.upload_file_url = `${base}web/doctors/${coach.upload_file_url}`;
            }
            if (coach.acc_upload_file) {
                coach.acc_upload_file = `${base}web/doctors/${coach.acc_upload_file}`;
            }
            if (coach.pcc_upload_file) {
                coach.pcc_upload_file = `${base}web/doctors/${coach.pcc_upload_file}`;
            }
            if (coach.mcc_upload_file) {
                coach.mcc_upload_file = `${base}web/doctors/${coach.mcc_upload_file}`;
            }
            if (coach.emcc_upload_file) {
                coach.emcc_upload_file = `${base}web/doctors/${coach.emcc_upload_file}`;
            }
            if (coach.co_active_upload_file) {
                coach.co_active_upload_file = `${base}web/doctors/${coach.co_active_upload_file}`;
            }
            if (coach.other_upload_file) {
                coach.other_upload_file = `${base}web/doctors/${coach.other_upload_file}`;
            }

            return successResponse(res, 200, "Get coach by Id successfully", coach)
        }

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Update Coach
async function updateCoach(req: any, res: Response) {
    logger.info({ component }, "Update Coach");

    try {
        const coachId = req.params.id;
        if (!coachId) return errorResponse(res, 400, "Coach ID is required");

        const { body, files } = req;

        const existingCoach = await prisma.coach.findUnique({
            where: { id: coachId }
        });
        if (!existingCoach) {
            return errorResponse(res, 404, "Coach not found");
        }

        /* ================== FIELD CONFIG (FROM PRISMA MODEL) ================== */

        const allowedFields = [
            // basic
            "first_name",
            "middle_name",
            "last_name",
            "email",
            "mobile",
            "linked_url",
            "country_code",
            "website",
            "timezone",
            "terms_conditions",

            // files
            "image_url",
            "upload_file_url",
            "acc_upload_file",
            "pcc_upload_file",
            "mcc_upload_file",
            "emcc_upload_file",
            "co_active_upload_file",
            "other_upload_file",

            // coaching profile
            "coaching_credentials",
            "other_coaching_credentials",
            "coaching_hours",
            "coaching_experience",

            "industries",
            "other_industries",
            "leadership_levels",
            "coaching_topics",
            "coaching_style",
            "other_coaching_style",
            "coaching_philosophy",
            "coaching_strength",
            "preferred_client",

            "clients_situation",
            "other_clients_situation",
            "coaching_boundaries",

            "session_rates",
            "connecting_coaches",
            "connecting_other_coaches",

            "anything",
            "bio"
        ];

        const jsonArrayFields = [
            "coaching_credentials",
            "industries",
            "leadership_levels",
            "coaching_style",
            "clients_situation",
            "session_rates"
        ];

        const numberFields = [
            "coaching_hours",
            "connecting_coaches"
        ];

        const booleanFields = ["terms_conditions"];

        /* ================== PARSE FORM DATA ================== */

        const parsedBody = parseFormData(body, jsonArrayFields, numberFields);
        const updateData: any = {};

        // whitelist + ignore empty values
        for (const key in parsedBody) {
            if (
                allowedFields.includes(key) &&
                parsedBody[key] !== undefined &&
                parsedBody[key] !== null &&
                parsedBody[key] !== ""
            ) {
                updateData[key] = parsedBody[key];
            }
        }

        /* ================== TYPE CONVERSION ================== */

        // Boolean fix (multipart/form-data sends string)
        booleanFields.forEach(field => {
            if (updateData[field] !== undefined) {
                updateData[field] =
                    updateData[field] === true ||
                    updateData[field] === "true";
            }
        });

        // Number fix
        numberFields.forEach(field => {
            if (updateData[field] !== undefined) {
                updateData[field] = Number(updateData[field]);
            }
        });

        /* ================== FILE UPLOADS ================== */

        const folderName = "web/doctors";

        const image = files?.["image_url"]?.[0];
        const upload = files?.["upload_file_url"]?.[0];

        const accFile = files?.["acc_upload_file"]?.[0];
        const pccFile = files?.["pcc_upload_file"]?.[0];
        const mccFile = files?.["mcc_upload_file"]?.[0];
        const emccFile = files?.["emcc_upload_file"]?.[0];
        const coactiveFile = files?.["co_active_upload_file"]?.[0];
        const otherFile = files?.["other_upload_file"]?.[0];

        // image
        if (image) {
            validateFileType(image, ["jpg", "jpeg", "png"]);
            validateFileSize(image, 2);
            updateData.image_url = await uploadToS3WithName(
                image,
                folderName,
                `${coachId}_profile`
            );
        }

        // pdfs
        const pdfFiles = [
            { file: upload, key: "upload_file_url", suffix: "general" },
            { file: accFile, key: "acc_upload_file", suffix: "acc" },
            { file: pccFile, key: "pcc_upload_file", suffix: "pcc" },
            { file: mccFile, key: "mcc_upload_file", suffix: "mcc" },
            { file: emccFile, key: "emcc_upload_file", suffix: "emcc" },
            { file: coactiveFile, key: "co_active_upload_file", suffix: "co" },
            { file: otherFile, key: "other_upload_file", suffix: "other" }
        ];

        for (const item of pdfFiles) {
            if (item.file) {
                validateFileType(item.file, ["pdf"]);
                validateFileSize(item.file, 2);
                updateData[item.key] = await uploadToS3WithName(
                    item.file,
                    folderName,
                    `${coachId}_${item.suffix}`
                );
            }
        }

        /* ================== PRISMA UPDATE ================== */

        const updatedCoach = await prisma.coach.update({
            where: { id: coachId },
            data: updateData
        });

        return successResponse(
            res,
            200,
            "Coach updated successfully",
            updatedCoach
        );

    } catch (error: any) {
        return errorResponse(res, 500, error.message);
    }
}

// Delete Coach
async function deleteCoach(req: Request, res: Response) {
    logger.info({ component }, "Delete Coach");

    try {
        const coachId = req.params.id;
        if (!coachId) return errorResponse(res, 400, "Coach ID is required");

        const coach = await prisma.coach.findUnique({ where: { id: coachId } });
        if (!coach) return errorResponse(res, 404, "Coach not found");

        const folderName = "web/doctors";

        const updatedCoach = await prisma.coach.update({
            where: { id: coachId },
            data: { status: 2 }
        });

        if (coach.image_url) await deleteFromS3(folderName, coach.image_url);
        if (coach.upload_file_url) await deleteFromS3(folderName, coach.upload_file_url);
        if (coach.acc_upload_file) await deleteFromS3(folderName, coach.acc_upload_file);
        if (coach.pcc_upload_file) await deleteFromS3(folderName, coach.pcc_upload_file);
        if (coach.emcc_upload_file) await deleteFromS3(folderName, coach.emcc_upload_file);
        if (coach.mcc_upload_file) await deleteFromS3(folderName, coach.mcc_upload_file);
        if (coach.co_active_upload_file) await deleteFromS3(folderName, coach.co_active_upload_file)
        if (coach.other_upload_file) await deleteFromS3(folderName, coach.other_upload_file);

        return successResponse(res, 200, "Coach deleted successfully", updatedCoach);

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Enable Disable Coach
async function enableDisableCoach(req: Request, res: Response) {
    logger.info({ component }, "Enable Disable Coach");

    try {
        const id = req.params.id;
        const { status } = req.body;

        if (!id) return errorResponse(res, 400, "Coach ID is required");
        if (status === undefined || status === null) {
            return errorResponse(res, 400, "Status is required (0 or 1)");
        }

        const [err, coach] = await handle<Coach | null>(
            prisma.coach.findUnique({ where: { id } })
        );
        if (!coach) return errorResponse(res, 404, "Coach not found");

        const [errs, updated] = await handle(
            prisma.coach.update({ where: { id }, data: { status: Number(status) } })
        );

        return successResponse(res, 200, `Coach ${status == 1 ? "enabled" : "disabled"} successfully`, updated);

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Get Coach Subscription History
async function getCoachSubscriptionHistory(req: Request, res: Response) {
    logger.info({ component }, "Coach Subscription History");

    try {
        const { coach_id, month, year } = req.body;

        const page = Number(req.body.page ?? 0);
        const itemPerPage = Number(req.body.itemPerPage ?? 0);
        const search = req.body.search?.trim() ?? "";

        const noPagination = !page || !itemPerPage;

        let whereCondition: any = {};

        if (coach_id) whereCondition.coach_id = coach_id;

        if (search !== "") {
            whereCondition.AND = [{
                OR: [
                    { subscription_id: { contains: search, mode: "insensitive" } },
                    { subscription_type_id: { contains: search, mode: "insensitive" } },
                    { stripe_customer_id: { contains: search, mode: "insensitive" } },
                    isNaN(Number(search)) ? {} : { amount: Number(search) }
                ]
            }];
        }

        // Month / Year Filter
        let monthNum = Number(month);
        let yearNum = Number(year);

        // Case 1: month + year → exact match
        if (monthNum && yearNum) {
            whereCondition.current_period_start = {
                gte: new Date(yearNum, monthNum - 1, 1),
                lte: new Date(yearNum, monthNum, 0)
            };
        }

        // Case 2: only year
        else if (!monthNum && yearNum) {
            whereCondition.current_period_start = {
                gte: new Date(yearNum, 0, 1),
                lte: new Date(yearNum, 11, 31)
            };
        }

        // Case 3: only month → ANY YEAR
        else if (monthNum && !yearNum) {
            const monthStartDay = 1;
            const monthEndDay = 31;

            const startYear = 1900;
            const endYear = 2100;

            const yearRanges = [];

            for (let y = startYear; y <= endYear; y++) {
                yearRanges.push({
                    current_period_start: {
                        gte: new Date(y, monthNum - 1, monthStartDay),
                        lte: new Date(y, monthNum - 1, monthEndDay),
                    }
                });
            }

            whereCondition.AND = [
                ...(whereCondition.AND ?? []),
                { OR: yearRanges }
            ];
        }

        const totalCount = await prisma.coachSubscription.count({
            where: whereCondition
        });

        let query: any = {
            where: whereCondition,
            orderBy: { created_at: "desc" },
            include: {
                coach: { select: { first_name: true } },
                subscription_plan: {
                    select: {
                        plan_name: true,
                        plan_type: true
                    }
                }
            }
        };

        if (!noPagination) {
            query.skip = (page - 1) * itemPerPage;
            query.take = itemPerPage;
        }

        const [err, subscriptionsRaw] = await handle<any[]>(
            prisma.coachSubscription.findMany(query)
        );

        if (!subscriptionsRaw || subscriptionsRaw.length === 0) {
            return res.status(200).json({
                status: true,
                statusCode: 200,
                data: [],
                message: "No records found"
            });
        }

        const subscriptions = Array.isArray(subscriptionsRaw) ? subscriptionsRaw : [];

        const formatted = subscriptions.map((sub: any) => {
            let subscriptionTypeName = null;

            if (sub.subscription_plan?.plan_type && Array.isArray(sub.subscription_plan.plan_type)) {
                const match = sub.subscription_plan.plan_type.find(
                    (pt: any) => pt.id === sub.subscription_type_id
                );
                subscriptionTypeName = match?.plan_type_name ?? null;
            }

            return {
                id: sub.id,
                coach_id: sub.coach_id,
                coach_name: sub.coach?.first_name ?? null,
                subscription_plan_id: sub.subscription_id,
                subscription_plan_name: sub.subscription_plan?.plan_name ?? null,
                subscription_type_id: sub.subscription_type_id,
                subscription_type_name: subscriptionTypeName,
                stripe_customer_id: sub.stripe_customer_id,
                status: sub.status,
                current_period_start: sub.current_period_start,
                current_period_end: sub.current_period_end,
                amount: sub.amount,
                currency: sub.currency,
                created_at: sub.created_at,
                updated_at: sub.updated_at
            };
        });

        return successResponse(res, 200, "Get all coach subscription history successfully", {
            totalCount,
            data: formatted
        });

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Map Client with Coach
async function mapClient(req: Request, res: Response) {
    logger.info({ component }, "Map Client");

    try {
        const { client_id } = req.body;

        if (!client_id) return errorResponse(res, 400, "Client ID is required");

        // Fetch all history rows
        const clientHistory = await prisma.clientHistory.findMany({
            where: { client_id }
        });

        if (!clientHistory || clientHistory.length === 0)
            return errorResponse(res, 404, "Client history not found");

        let results: any[] = [];

        // Process each history record separately
        for (const history of clientHistory) {

            const { time_zone, industries, range_per_session } = history;

            // clean industries
            const cleanedIndustries = (Array.isArray(industries) ? industries : [])
                .filter(i => typeof i === "string")
                .map(i => i.toLowerCase())
                .filter(i => i && i !== "others");

            // Build WHERE clause
            let where: any = {
                OR: [
                    { timezone: time_zone },

                    // Match specific session ranges
                    { session_rates: { array_contains: range_per_session ?? [] } }
                ]
            };

            // Match ANY industry
            if (cleanedIndustries.length) {
                where.OR.push(
                    ...cleanedIndustries.map(ind => ({
                        industries: { array_contains: [ind] }
                    }))
                );
            }

            // Fetch matched coaches
            const coaches = await prisma.coach.findMany({
                where,
                orderBy: { created_at: "desc" }
            });

            const totalCount = await prisma.coach.count({ where });

            const formattedCoaches = coaches.map((c: Coach) => ({
                ...c,
                coach_id: c.id,
                rating: 1,
                image_url: c.image_url
                    ? `${process.env.S3StorageLinkForimages}web/doctors/${c.image_url}`
                    : null,
                upload_file_url: c.upload_file_url
                    ? `${process.env.S3StorageLinkForimages}web/doctors/${c.upload_file_url}`
                    : null,
            }));

            // Push this history result
            results.push({
                matchingFields: {
                    time_zone,
                    industries: cleanedIndustries,
                    range_per_session
                },
                totalCount,
                coaches: formattedCoaches
            });
        }

        return successResponse(res, 200, "Matched coaches", results);

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Map Coach based on client
async function mapCoachWithClient(req: Request, res: Response) {
    logger.info({ component }, "Map Coach With Client");

    const {
        client_id,
        leadership_levels,
        range_per_session,
        industries,
        search,
        industries_filter
    } = req.body;

    try {
        /**
         * ============================
         * Helper
         * ============================
         */
        const jsonToStringArray = (value: unknown): string[] => {
            if (
                value === null ||
                value === undefined ||
                value === "" ||
                !Array.isArray(value)
            ) {
                return [];
            }

            return value.filter(
                (v): v is string => typeof v === "string" && v.trim() !== ""
            );
        };

        /**
         * ============================
         * Normalize inputs
         * ============================
         */
        const inputIndustries = jsonToStringArray(industries).map(i =>
            i.toLowerCase()
        );

        const inputRates = jsonToStringArray(range_per_session).map(r =>
            r.toLowerCase()
        );

        const inputLeadershipLevels = jsonToStringArray(leadership_levels).map(l =>
            l.toLowerCase()
        );


        const filterIndustries = jsonToStringArray(industries_filter).map(i =>
            i.toLowerCase()
        );

        const searchValue =
            typeof search === "string" && search.trim() !== ""
                ? search.toLowerCase()
                : null;

        /**
         * ============================
         * Fetch coaches (DB-level)
         * ============================
         */
        const coaches = await prisma.coach.findMany({
            where: {
                // timezone: time_zone,
                AND: [
                    { status: { not: 2 } },
                    { is_approved: 1 }
                ]
            }
        });

        /**
         * ============================
         * Mandatory match
         * industries + session_rates
         * ============================
         */
        let matchedCoaches = coaches.filter(coach => {
            const coachIndustries = jsonToStringArray(coach.industries).map(i =>
                i.toLowerCase()
            );

            const coachRates = jsonToStringArray(coach.session_rates).map(r =>
                r.toLowerCase()
            );

            const industryMatch =
                inputIndustries.length > 0 &&
                coachIndustries.some(i => inputIndustries.includes(i));

            const rateMatch =
                inputRates.length === 0 ||   // skip if not provided
                coachRates.some(r => inputRates.includes(r));

            return industryMatch && rateMatch;
        });

        if (!matchedCoaches.length) {
            return successResponse(res, 200, "No matched records found", []);
        }

        /**
         * ============================
         * OPTIONAL SEARCH (ONLY coaching_experience)
         * ============================
         */
        if (searchValue) {
            matchedCoaches = matchedCoaches.filter(coach =>
                typeof coach.coaching_experience === "string" &&
                coach.coaching_experience
                    .toLowerCase()
                    .includes(searchValue)
            );
        }

        if (!matchedCoaches.length) {
            return successResponse(res, 200, "No matched records found", []);
        }

        /**
         * ============================
         * OPTIONAL industries_filter (JSON)
         * ============================
         */
        if (filterIndustries.length > 0) {
            matchedCoaches = matchedCoaches.filter(coach => {
                const coachIndustries = jsonToStringArray(coach.industries).map(
                    i => i.toLowerCase()
                );

                return coachIndustries.some(i =>
                    filterIndustries.includes(i)
                );
            });
        }

        if (!matchedCoaches.length) {
            return successResponse(res, 200, "No matched records found", []);
        }

        /**
        * ============================
        * OPTIONAL leadership_levels (JSONB)
         * ============================
        */
        if (inputLeadershipLevels.length > 0) {
            matchedCoaches = matchedCoaches.filter(coach => {
                const coachLeadershipLevels = jsonToStringArray(
                    coach.leadership_levels
                ).map(l => l.toLowerCase());

                return coachLeadershipLevels.some(l =>
                    inputLeadershipLevels.includes(l)
                );
            });
        }

        if (!matchedCoaches.length) {
            return successResponse(res, 200, "No matched records found", []);
        }

        //    (FOR already_assign)
        // ============================ */
        const mappings = await prisma.coachesClientMapping.findMany({
            where: { client_id },
            select: { assigned_coach_ids: true }
        });

        // Collect all assigned coach IDs
        const assignedCoachIds = new Set<string>();

        mappings.forEach(m => {
            const ids = Array.isArray(m.assigned_coach_ids)
                ? m.assigned_coach_ids.filter(
                    (id): id is string => typeof id === "string"
                )
                : [];

            ids.forEach(id => assignedCoachIds.add(id));
        });

        /**
         * ============================
         * Coach request (reason merge)
         * ============================
         */
        const coachRequest = await prisma.coachRequest.findFirst({
            where: { client_id }
        });

        const requestCoaches: { id: string; reason?: string }[] =
            Array.isArray(coachRequest?.coaches)
                ? (coachRequest!.coaches as { id: string; reason?: string }[])
                : [];

        /**
         * ============================
         * Final response (ALL fields)
         * ============================
         */
        const finalCoaches = matchedCoaches.map(coach => {
            const found = requestCoaches.find(rc => rc.id === coach.id);

            return {
                ...coach,
                already_assign: assignedCoachIds.has(coach.id) ? 1 : 0, // 1 - already assign, 0 - new
                reason: found?.reason ?? null
            };
        });

        return successResponse(
            res,
            200,
            "Matched coaches successfully",
            finalCoaches
        );

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Assign Coaches to Client
async function assignCoaches(req: Request, res: Response) {
    logger.info({ component }, "Assign Coaches to client");
    try {
        const { client_id, coach_ids } = req.body;
        if (!client_id) return errorResponse(res, 400, "client_id is required");
        if (!coach_ids || !Array.isArray(coach_ids) || coach_ids.length === 0) {
            return errorResponse(res, 400, "coach_ids must be a non-empty array");
        }
        const formattedCoachIds = coach_ids.map((id: string) => ({
            id: id,
            selected: false
        }));
        const primary_coach_id = coach_ids[0];
        const latestHistory = await prisma.clientHistory.findFirst({
            where: { client_id: client_id },
            orderBy: { created_at: 'desc' },
            select: { id: true }
        });
        if (!latestHistory) {
            return errorResponse(res, 404, "No client history found for this client");
        }
        const mapping = await prisma.coachesClientMapping.create({
            data: {
                client_id,
                assigned_coach_ids: formattedCoachIds,
                primary_coach_id,
                client_history_id: latestHistory.id
            }
        });
        return successResponse(res, 200, "Coaches assigned successfully", mapping);
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// After Assigned Get all coaches
// async function getAssignedCoaches(req: Request, res: Response) {
//     logger.info({ component }, "Get ALL assigned coaches by client");

//     try {
//         const { client_id } = req.body;

//         if (!client_id) return errorResponse(res, 400, "Client ID is required");

//         // Fetch ALL mapping rows for the client
//         const mappings = await prisma.coachesClientMapping.findMany({
//             where: { client_id },
//             orderBy: { created_at: "desc" }
//         });

//         if (!mappings.length) {
//             return errorResponse(res, 200, "No mapping found");
//         }

//         // Fetch coachRequest record for reasons
//         const coachRequest = await prisma.coachRequest.findFirst({
//             where: { client_id }
//         });

//         // Cast JSON to typed structure
//         const requestCoaches: { id: string; reason?: string }[] =
//             Array.isArray(coachRequest?.coaches)
//                 ? (coachRequest!.coaches as { id: string; reason?: string }[])
//                 : [];

//         let finalCoaches: any[] = [];
//         let reason: string | null = null;

//         for (const map of mappings) {
//             // Extract assigned coach IDs
//             const coachIds = Array.isArray(map.assigned_coach_ids)
//                 ? map.assigned_coach_ids.filter(id => typeof id === "string")
//                 : [];

//             if (!coachIds.length) continue;

//             // Fetch coach details
//             const coaches = await prisma.coach.findMany({
//                 where: { id: { in: coachIds } }
//             });

//             const formatted = coaches.map(c => {
//                 // Get per-coach reason from coachRequest table
//                 const matchedReq = requestCoaches.find(rc => rc.id === c.id);

//                 return {
//                     // coach_id: c.id,
//                     // name: c.first_name,
//                     ...c,
//                     rating: 1,
//                     image_url: c.image_url
//                         ? `${process.env.S3StorageLinkForimages}web/doctors/${c.image_url}`
//                         : null,
//                     upload_file_url: c.upload_file_url
//                         ? `${process.env.S3StorageLinkForimages}web/doctors/${c.upload_file_url}`
//                         : null,

//                     // SAFE and correct
//                     request_reason: matchedReq?.reason ?? null
//                 };
//             });

//             // Mapping-level rejection reason
//             if (map.reason) {
//                 reason = map.reason;
//                 finalCoaches.push(...formatted);
//                 break;
//             }

//             // Normal assigned coaches
//             if (!reason) finalCoaches = formatted;
//         }

//         return successResponse(res, 200, "Assigned coaches", {
//             client_id,
//             coaches: finalCoaches
//         });

//     } catch (error: any) {
//         console.error(error);
//         return errorResponse(res, 500, error.message);
//     }
// }

async function getAssignedCoaches(req: Request, res: Response) {
    logger.info({ component }, "Get ALL assigned coaches by client");

    try {
        const { client_id } = req.body;

        if (!client_id)
            return errorResponse(res, 400, "Client ID is required");

        /* ============================
           FETCH ALL MAPPINGS
        ============================ */
        const mappings = await prisma.coachesClientMapping.findMany({
            where: { client_id },
            select: {
                assigned_coach_ids: true,
                reason: true
            }
        });

        if (!mappings.length) {
            return successResponse(res, 200, "No mapping found", {
                client_id,
                coaches: []
            });
        }

        /* ============================
           COLLECT UNIQUE COACH IDS
        ============================ */
        const coachIdSet = new Set<string>();
        let mappingReason: string | null = null;

        mappings.forEach(m => {
            if (m.reason && !mappingReason) {
                mappingReason = m.reason;
            }

            if (Array.isArray(m.assigned_coach_ids)) {
                m.assigned_coach_ids.forEach(id => {
                    if (typeof id === "string") {
                        coachIdSet.add(id);
                    }
                });
            }
        });

        const coachIds = Array.from(coachIdSet);

        if (!coachIds.length) {
            return successResponse(res, 200, "No assigned coaches", {
                client_id,
                coaches: []
            });
        }

        /* ============================
           FETCH REQUEST REASONS
        ============================ */
        const coachRequest = await prisma.coachRequest.findFirst({
            where: { client_id }
        });

        const requestCoaches: { id: string; reason?: string }[] =
            Array.isArray(coachRequest?.coaches)
                ? (coachRequest!.coaches as any[])
                : [];

        const requestReasonMap = new Map(
            requestCoaches.map(rc => [rc.id, rc.reason ?? null])
        );

        /* ============================
           FETCH COACH DETAILS (ONCE)
        ============================ */
        const coaches = await prisma.coach.findMany({
            where: { id: { in: coachIds } }
        });

        /* ============================
           FORMAT RESPONSE
        ============================ */
        const finalCoaches = coaches.map(c => ({
            ...c,
            rating: 1,
            image_url: c.image_url
                ? `${process.env.S3StorageLinkForimages}web/doctors/${c.image_url}`
                : null,
            upload_file_url: c.upload_file_url
                ? `${process.env.S3StorageLinkForimages}web/doctors/${c.upload_file_url}`
                : null,
            request_reason: requestReasonMap.get(c.id) ?? null
        }));

        return successResponse(res, 200, "Assigned coaches", {
            client_id,
            reason: mappingReason,
            coaches: finalCoaches
        });

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}


// Unassigned coach
async function unassignedCoach(req: Request, res: Response) {
    logger.info({ component }, "Remove Coach From Client Mapping");

    const { client_id, coach_id } = req.body;

    if (!client_id || !coach_id) {
        return errorResponse(res, 400, "client_id and coach_id are required");
    }

    try {
        const mappings = await prisma.coachesClientMapping.findMany({
            where: { client_id },
            select: {
                id: true,
                assigned_coach_ids: true
            }
        });

        if (!mappings.length) {
            return successResponse(res, 200, "No mapping found for this client", []);
        }

        let updatedCount = 0;

        /* ============================
           Process each mapping row
        ============================ */
        for (const mapping of mappings) {
            const coachIds = Array.isArray(mapping.assigned_coach_ids)
                ? mapping.assigned_coach_ids.filter(
                    (id): id is string => typeof id === "string"
                )
                : [];

            // If coach_id not present → skip
            if (!coachIds.includes(coach_id)) continue;

            // Remove coach_id
            const updatedCoachIds = coachIds.filter(id => id !== coach_id);

            await prisma.coachesClientMapping.update({
                where: { id: mapping.id },
                data: {
                    assigned_coach_ids: updatedCoachIds
                }
            });

            updatedCount++;
        }

        if (updatedCount === 0) {
            return successResponse(
                res,
                200,
                "Coach not assigned to this client",
                { removed: 0 }
            );
        }

        return successResponse(
            res,
            200,
            "Coach unassigned successfully",
            { removed: updatedCount }
        );

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Approve or Reject Coach
async function approveRejectCoach(req: any, res: Response) {
    logger.info({ component }, "Approve/Reject Coach");

    try {
        const { coach_id, type, rejection_reason, trial_months, comments,
            trial_months_annual, discount_percentage, discount_percentage_annual, months, months_annual } = req.body;

        const userId = req.user?.id;
        const role = req.user?.role;

        if (!coach_id) return errorResponse(res, 400, "Coach ID is required");
        if (![0, 1].includes(Number(type)))
            return errorResponse(res, 400, "Type must be 0 (approve) or 1 (reject)");

        const coach = await prisma.coach.findUnique({ where: { id: coach_id } });
        if (!coach) return errorResponse(res, 404, "Coach not found");

        let updateData: any = {};
        let responseMessage = "";

        // Approve
        if (Number(type) === 0) {
            responseMessage = "Coach approved successfully";

            const trialMonths = Number(trial_months ?? 0);
            const trialMonthsAnnual = Number(trial_months_annual ?? 0);

            const referenceType =
                trialMonths > 0 || trialMonthsAnnual > 0
                    ? "Trials"
                    : "Initial";

            await prisma.discount.create({
                data: {
                    coach_id: coach.id,
                    reference_type: referenceType,

                    trial_months: trialMonths,
                    trial_months_annual: trialMonthsAnnual,

                    discount_percentage: Number(discount_percentage ?? 0),
                    discount_percentage_annual: Number(discount_percentage_annual ?? 0),

                    months: Number(months ?? 0),
                    months_annual: Number(months_annual ?? 0),
                }
            });

            updateData = {
                is_approved: 1,
                comments: comments

            };

            // const paymentLink = `${process.env.FORGET_PASS_LINK}/pay.html?pi=${paymentIntentId}`;
            const email = coach.email;
            const rawPassword = email.split("@")[0];

            await sendEmail({
                to: coach.email,
                subject: "Your Coach Profile Was Approved",
                html: `
                    <h3>Hello ${coach.first_name},</h3>
                    <p>Your coach profile has been approved successfully. Below are your login credentials:</p>
                    <p><b>Email:</b> ${email}</p>
                    <p><b>Password:</b> ${rawPassword}</p>
                `
            });
        }

        // Reject
        if (Number(type) === 1) {
            responseMessage = "Coach inactive successfully";

            if (!rejection_reason)
                return errorResponse(res, 400, "Rejection reason is required");

            updateData = {
                is_approved: 2,
                rejection_reason,
                approved_at: null
            };

            if (role === "Admin") updateData.approved_by = userId;
            if (role === "Staff") updateData.approved_by_staff = userId;

            await sendEmail({
                to: coach.email,
                subject: "Your Coach Profile Was Inactive",
                html: `
                    <h3>Hello ${coach.first_name}</h3>
                    <p>Your coach profile has been <b>inactive</b>.</p>
                    <p>Reason: ${rejection_reason}</p>
                `
            });
        }

        const updated = await prisma.coach.update({
            where: { id: coach_id },
            data: updateData
        });

        return successResponse(res, 200, responseMessage, updated);

    } catch (error: any) {
        logger.error("Coach Controller", error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Assign Coach with static site
async function assignCoachStaticPage(req: Request, res: Response) {
    logger.info({ component }, "Assign coach with static page");

    try {
        const { coach_id, is_static } = req.body;

        // Check coach exists
        const existingCoach = await prisma.coach.findUnique({
            where: { id: coach_id }
        });

        if (!existingCoach) return errorResponse(res, 404, "Coach not found");

        // Update is_static to 1
        const updatedCoach = await prisma.coach.update({
            where: { id: coach_id },
            data: { is_static: is_static }
        });
        if (updatedCoach.is_static == 1) {
            return successResponse(res, 200, "Coach assigned to static site successfully", updatedCoach);
        }
        else {
            return successResponse(res, 200, "Coach unassigned to static site successfully", updatedCoach);
        }
    } catch (error: any) {
        return errorResponse(res, 500, error.message);

    }
};

// After delete that activate the coach
async function activateCoach(req: Request, res: Response) {
    logger.info({ component }, "Update Coach Status");

    const { coach_id, status } = req.body;

    try {
        // Validation
        if (!coach_id) {
            return errorResponse(res, 400, "Coach ID is required");
        }
        const coach = await prisma.coach.findUnique({
            where: { id: coach_id }
        });

        if (!coach) {
            return errorResponse(res, 404, "Coach not found");
        }

        // Update status
        const updatedCoach = await prisma.coach.update({
            where: { id: coach_id },
            data: {
                status
            }
        });

        return successResponse(
            res,
            200,
            "Coach activated successfully",
            updatedCoach
        );

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

function calculateSubscriptionDates(
    planType: number,
    discount: any
) {
    const startDate = new Date();
    const endDate = new Date();

    let trialMonths = 0;
    let durationMonths = 0;
    let isTrial = false;

    if (planType === 0) {
        // Monthly
        trialMonths = discount?.trial_months ?? 0;
        durationMonths = discount?.months ?? 1;
    } else {
        // Annual
        trialMonths = discount?.trial_months_annual ?? 0;
        durationMonths = discount?.months_annual ?? 12;
    }

    // Free trial case
    if (trialMonths > 0) {
        endDate.setMonth(endDate.getMonth() + trialMonths);
        isTrial = true;
    } else {
        endDate.setMonth(endDate.getMonth() + durationMonths);
    }

    return {
        current_period_start: startDate,
        current_period_end: endDate,
        is_trial: isTrial
    };
}

// Calculate the coach final amount
async function calculateCoachPlanAmount(req: Request, res: Response) {
    logger.info({ component }, "Calculate the coach plan amount");

    try {
        const { amount, plan_type } = req.body;

        const userRole = req.user?.role;
        const coach_id = req.user?.id;

        if (amount === undefined || plan_type === undefined) {
            return res.status(400).json({
                status: false,
                message: "amount and plan_type are required"
            });
        }

        const discount = await prisma.discount.findFirst({
            where: { coach_id }
        });

        const baseAmount = Number(amount);
        let finalAmount = baseAmount;
        let discountAmount = 0;
        let defaultOfferAmount = 0;

        let trialMonths = 0;
        let planDiscountPercentage = 0;

        /**
         * ============================
         * PLAN CONFIG
         * ============================
         */
        if (Number(plan_type) === 0) {
            trialMonths = discount?.trial_months ?? 0;
            planDiscountPercentage = discount?.discount_percentage ?? 0;
        } else {
            trialMonths = discount?.trial_months_annual ?? 0;
            planDiscountPercentage = discount?.discount_percentage_annual ?? 0;
        }

        /**
         * ============================
         * TRIAL CHECK
         * ============================
         */
        if (trialMonths > 0 && planDiscountPercentage === 100) {
            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + trialMonths);

            return res.status(200).json({
                status: true,
                plan_type: Number(plan_type) === 0 ? "Monthly" : "Annual",
                is_free_trial: true,
                trial_months: trialMonths,
                trial_start_date: startDate,
                trial_end_date: endDate,
                final_amount: 0
            });
        }

        /**
         * ============================
         * PLAN DISCOUNT
         * ============================
         */
        if (planDiscountPercentage > 0) {
            discountAmount = (baseAmount * planDiscountPercentage) / 100;
            finalAmount -= discountAmount;
        }

        /**
         * ============================
         * DEFAULT 10% OFFER (REDUCE)
         * ============================
         */
        defaultOfferAmount = (finalAmount * 10) / 100;
        finalAmount -= defaultOfferAmount;

        return successResponse(
            res,
            200,
            "Calculated final amount successfully",
            {
                plan_type: Number(plan_type) === 0 ? "Monthly" : "Annual",
                base_amount: baseAmount,
                plan_discount_percentage: planDiscountPercentage,
                plan_discount_amount: discountAmount,
                default_10_percent_offer: defaultOfferAmount,
                final_amount: Math.round(finalAmount)
            }
        );

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Create Initial Payment Intent
async function createInitialPaymentIntent(req: Request, res: Response) {
    logger.info({ component }, "Create the initial Payment");

    try {
        const { amount, plan_id, plan_type_id, plan_type } = req.body;

        if (!amount || !plan_id) {
            return res.status(400).json({
                status: false,
                message: "amount and plan_id are required"
            });
        }

        // Coach ID from login (JWT)
        const coach_id = req.user?.id;

        // Fetch coach
        const coach = await prisma.coach.findUnique({
            where: { id: coach_id }
        });

        if (!coach) {
            return res.status(404).json({
                status: false,
                message: "Coach not found"
            });
        }

        /**
         * ============================
         * CREATE STRIPE CUSTOMER
         * ============================
         */
        const customer = await stripe.customers.create({
            email: coach.email,
            name: coach.first_name,
            metadata: {
                coach_id: coach.id
            }
        });

        /**
         * ============================
         * CREATE PAYMENT INTENT
         * ============================
         */
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(Number(amount) * 100),
            currency: "usd",
            customer: customer.id,
            automatic_payment_methods: { enabled: true },
            metadata: {
                coach_id: coach.id,
                plan_id: plan_id,
                plan_type: plan_type,
                purpose: "initial_registration"
            }
        });

        /**
         * ============================
         * SAVE PAYMENT (PENDING)
         * ============================
         */
        await prisma.payments.create({
            data: {
                coach_id: coach.id,
                payment_type: "initial_registration",
                related_subscription_id: plan_id,
                related_subscription_type_id: plan_type_id,
                stripe_customer_id: customer.id,
                stripe_payment_intent_id: paymentIntent.id,
                amount: Number(amount),
                currency: "usd",
                plan_type: plan_type,
                is_paid: 0,
                status: 0
            }
        });

        return res.status(200).json({
            status: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Handle Stripe Webhook
async function handleStripeWebhook(req: any, res: Response) {
    logger.info({ component }, "Stripe Webhook Triggered");

    const sig = req.headers["stripe-signature"] as string;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            endpointSecret
        );
    } catch (err: any) {
        logger.error({ err }, "Stripe webhook signature verification failed");
        return errorResponse(res, 400, "Webhook signature error");
    }

    /**
     * PAYMENT SUCCESS
     */
    if (event.type === "payment_intent.succeeded") {
        const intent = event.data.object as Stripe.PaymentIntent;

        const paymentIntentId = intent.id;
        const paymentMethodId = intent.payment_method as string;
        const chargeId = intent.latest_charge as string;

        const paymentRecord = await prisma.payments.findFirst({
            where: { stripe_payment_intent_id: paymentIntentId }
        });

        if (!paymentRecord) {
            logger.warn("Payment record not found");
            return res.json({ received: true });
        }

        // Retrieve payment method (CARD DETAILS)
        const paymentMethod = await stripe.paymentMethods.retrieve(
            paymentMethodId
        );

        const card = paymentMethod.card;

        // Update payment record
        await prisma.payments.updateMany({
            where: { stripe_payment_intent_id: paymentIntentId },
            data: {
                is_paid: 1,
                status: 1,
                stripe_charge_id: chargeId,
                payment_method: paymentMethodId,

                // SAFE CARD DETAILS
                card_brand: card?.brand ?? null,
                card_last4: card?.last4 ?? null,
                // card_exp_month: card?.exp_month ?? null,
                // card_exp_year: card?.exp_year ?? null,

                failure_reason: null,
                updated_at: new Date()
            }
        });

        const plan = await prisma.subscriptionPlan.findFirst({
            where: { id: paymentRecord.related_subscription_id! }
        });

        // Update coach
        await prisma.coach.update({
            where: { id: paymentRecord.coach_id },
            data: {
                current_payment_method_id: paymentMethodId,
                current_subscription_id: plan?.id ?? null,
                card_brand: card?.brand ?? null,
                card_last4: card?.last4 ?? null
            }
        });

        // Create coach subscription
        // await prisma.coachSubscription.create({
        //     data: {
        //         coach_id: paymentRecord.coach_id,
        //         subscription_id: paymentRecord.related_subscription_id!,
        //         subscription_type_id: paymentRecord.related_subscription_id!,
        //         stripe_customer_id: paymentRecord.stripe_customer_id!,
        //         status: 1,
        //         current_period_start: new Date(),
        //         current_period_end: new Date(
        //             Date.now() + 30 * 24 * 60 * 60 * 1000
        //         ),
        //         amount: Number(paymentRecord.amount),
        //         currency: paymentRecord.currency,
        //         discount_applied: 0,
        //         final_price: Number(paymentRecord.amount)
        //     }
        // });

        const discount = await prisma.discount.findFirst({
            where: { coach_id: paymentRecord.coach_id }
        });

        const {
            current_period_start,
            current_period_end,
            // is_trial
        } = calculateSubscriptionDates(
            paymentRecord.plan_type ?? 0,
            discount
        );

        // Deactivate old subscriptions
        // await prisma.coachSubscription.updateMany({
        //     where: { coach_id: paymentRecord.coach_id, status: 1 },
        //     data: { status: 0 }
        // });

        // Create subscription
        await prisma.coachSubscription.create({
            data: {
                coach_id: paymentRecord.coach_id,
                subscription_id: paymentRecord.related_subscription_id!,
                subscription_type_id: paymentRecord.related_subscription_type_id!,
                stripe_customer_id: paymentRecord.stripe_customer_id!,
                status: 1,
                current_period_start,
                current_period_end,
                amount: Number(paymentRecord.amount),
                currency: paymentRecord.currency,
                final_price: Number(paymentRecord.amount)
            }
        });

        logger.info("Payment succeeded and subscription activated");
    }

    /**
     * ===============================
     * PAYMENT FAILED
     * ===============================
     */
    if (event.type === "payment_intent.payment_failed") {
        const intent = event.data.object as Stripe.PaymentIntent;

        const paymentIntentId = intent.id;
        const failureMsg =
            intent.last_payment_error?.message ?? "Payment failed";

        const paymentRecord = await prisma.payments.findFirst({
            where: { stripe_payment_intent_id: paymentIntentId }
        });

        if (!paymentRecord) return res.json({ received: true });

        const coach = await prisma.coach.findUnique({
            where: { id: paymentRecord.coach_id }
        });

        if (!coach) return res.json({ received: true });

        // Update payment
        await prisma.payments.updateMany({
            where: { stripe_payment_intent_id: paymentIntentId },
            data: {
                status: 2,
                is_paid: 0,
                failure_reason: failureMsg,
                updated_at: new Date()
            }
        });

        // Disable user
        await prisma.user.update({
            where: { id: coach.user_id },
            data: { is_active: false }
        });

        logger.warn("Payment failed, user disabled");
    }

    return res.json({ received: true });
}

//Recall Client Secret
async function callClientSecret(req: any, res: Response) {
    try {
        const { payment_intent_id } = req.body;

        const intent = await stripe.paymentIntents.retrieve(payment_intent_id);

        const refreshed = await stripe.paymentIntents.update(payment_intent_id, {
            amount: intent.amount
        });

        return res.json({
            clientSecret: refreshed.client_secret
        });

    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}

// Update card details
async function updateCoachCard(req: Request, res: Response) {
    try {
        const { payment_method_id } = req.body;
        const coachId = req.user?.coach_id;

        if (!payment_method_id)
            return errorResponse(res, 400, "Payment method ID required");

        const coach = await prisma.coach.findUnique({
            where: { id: coachId }
        });

        if (!coach || !coach.stripe_customer_id)
            return errorResponse(res, 404, "Coach not found");

        //  Attach new card
        await stripe.paymentMethods.attach(payment_method_id, {
            customer: coach.stripe_customer_id
        });

        //  Make it default
        await stripe.customers.update(coach.stripe_customer_id, {
            invoice_settings: {
                default_payment_method: payment_method_id
            }
        });

        // Get new card details
        const pm = await stripe.paymentMethods.retrieve(payment_method_id);
        const card = pm.card;

        // UPDATE (overwrite old card info)
        await prisma.coach.update({
            where: { id: coachId },
            data: {
                current_payment_method_id: payment_method_id,
                card_brand: card?.brand ?? null,
                card_last4: card?.last4 ?? null,
                // card_exp_month: card?.exp_month ?? null,
                // card_exp_year: card?.exp_year ?? null
            }
        });

        return successResponse(
            res,
            200,
            "Card updated successfully"
        );

    } catch (err) {
        return errorResponse(res, 500, "Failed to update card");
    }
}


// Auto Renewal Subscription
async function autoRenewalSubscription(req: any, res: Response) {
    logger.info({ component }, "Auto Renewal");

    try {
        const { coach_id } = req.body;

        if (!coach_id)
            return errorResponse(res, 400, "coachId is required");

        const coach = await prisma.coach.findUnique({ where: { id: coach_id } });

        if (!coach || !coach.stripe_customer_id)
            return errorResponse(res, 400, "Missing Stripe customer");

        const lastPayment = await prisma.payments.findFirst({
            where: { coach_id, is_paid: 1 },
            orderBy: { created_at: "desc" }
        });

        if (!lastPayment)
            return errorResponse(res, 400, "No previous payment found");

        if (!lastPayment.payment_method)
            return errorResponse(res, 400, "Missing saved payment method");

        let retryIntent;

        try {
            retryIntent = await stripe.paymentIntents.create({
                amount: Math.round(lastPayment.amount * 100),
                currency: lastPayment.currency,
                customer: coach.stripe_customer_id,
                payment_method: lastPayment.payment_method,
                off_session: true,
                confirm: true
            });

        } catch (err: any) {

            await prisma.payments.create({
                data: {
                    coach_id,
                    payment_type: "auto_renewal",
                    amount: lastPayment.amount,
                    currency: lastPayment.currency,
                    stripe_customer_id: coach.stripe_customer_id,
                    payment_method: lastPayment.payment_method,
                    is_paid: 0,
                    status: 2,
                    failure_reason: err.message
                }
            });

            await prisma.user.update({
                where: { id: coach.user_id },
                data: { is_active: false }
            });

            return errorResponse(res, 400, "Auto renewal failed");
        }

        await prisma.payments.create({
            data: {
                coach_id,
                payment_type: "auto_renewal",
                amount: lastPayment.amount,
                currency: lastPayment.currency,
                stripe_payment_intent_id: retryIntent.id,
                stripe_customer_id: coach.stripe_customer_id,
                payment_method: lastPayment.payment_method,
                is_paid: 1,
                status: 1,
            }
        });

        return successResponse(res, 200, "Auto renewal successful");

    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}

export default {
    createCoach,
    getAllCoach,
    getCoachById,
    updateCoach,
    deleteCoach,
    enableDisableCoach,
    calculateCoachPlanAmount,
    createInitialPaymentIntent,
    getCoachSubscriptionHistory,
    mapClient,
    mapCoachWithClient,
    assignCoaches,
    getAssignedCoaches,
    unassignedCoach,
    activateCoach,
    approveRejectCoach,
    assignCoachStaticPage,
    handleStripeWebhook,
    callClientSecret,
    updateCoachCard,
    autoRenewalSubscription
};
