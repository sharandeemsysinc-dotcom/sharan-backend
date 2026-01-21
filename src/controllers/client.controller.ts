import { Request, Response } from "express";
import prisma from "../config/prisma";
import { ClientModel, StatusEnum } from "../models/client";
import { ClientHistoryModel } from "../models/clientHistory";
import logger from "../utils/logger";
import { successResponse, errorResponse } from "../utils/responseHandler";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import bcrypt from "bcryptjs";

const component = "Client Controller";

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
    const Key = `web/clients/${id}.${ext}`;

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

// Handle Async Wrapper
async function handle<T>(promise: Promise<T>): Promise<[any, T | undefined]> {
    try {
        const data = await promise;
        return [null, data];
    } catch (error) {
        return [error, undefined];
    }
}

// Create Client with Client History
async function createClient(req: Request, res: Response) {
    logger.info({ component }, "Create Client API Called", req.body);
    try {
        const {
            user_id,
            first_name,
            last_name,
            middle_name,
            email,
            country_code,
            mobile,
            city,
            linked_in_url,
            website_url,
            notes,
            profile_image,
            client_history,
            terms_conditions
        } = req.body;

        // Validate required fields
        if (!first_name || !last_name || !email) {
            return errorResponse(res, 400, "first_name, last_name, email, and mobile are required");
        }

        // Run everything in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // Check duplicate email in User table
            const existingUser = await tx.user.findUnique({ where: { email } });
            if (existingUser) {
                throw new Error("User with this email already exists");
            }

            // 1. Create USER record
            const user = await tx.user.create({
                data: {
                    email,
                    user_name: `${first_name} ${last_name}`,
                    role_id: 4, // Client
                    is_active: true,
                    status: 1
                }
            });

            // 2. Create CLIENT record
            const client = await tx.client.create({
                data: {
                    user_id: user.id,
                    first_name,
                    last_name,
                    middle_name,
                    email,
                    country_code,
                    mobile,
                    city,
                    linked_in_url,
                    website_url,
                    terms_conditions: terms_conditions || false,
                    notes,
                    status: StatusEnum.ACTIVE
                }
            });

            // Upload profile image if exists
            if (profile_image && profile_image.startsWith("data:image")) {
                const base64String = profile_image.split(",")[1];
                const sizeMB = calculateBase64Size(base64String);

                if (sizeMB > 2) {
                    throw new Error("Image exceeds 2MB");
                }

                const uploaded = await profilePictureUpload({
                    id: client.id,
                    image_url: profile_image
                });

                // Save ONLY THE ID in profile_image
                await tx.client.update({
                    where: { id: client.id },
                    data: { profile_image: uploaded.key }
                });

                // Update local object for response
                client.profile_image = uploaded.key;
            }

            // 3. Create CLIENT HISTORY (Mandatory)
            const historyData = client_history || {};
            const clientHistory = await tx.clientHistory.create({
                data: {
                    client_id: client.id,
                    current_role: historyData.current_role || null,
                    support_seek: historyData.support_seek || null,
                    coaching_goals: historyData.coaching_goals || null,
                    other_coaching_goals: historyData.other_coaching_goals || null,
                    coaching_time: historyData.coaching_time || null,
                    coaching_style: historyData.coaching_style || null,
                    other_coaching_style: historyData.other_coaching_style || null,
                    not_working_coach_style: historyData.not_working_coach_style || null,
                    leadership_levels: historyData.leadership_levels || null,
                    other_leadership_levels: historyData.other_leadership_levels || null,
                    coach_experience_in_industry: historyData.coach_experience_in_industry !== undefined ? historyData.coach_experience_in_industry : null,
                    industries: historyData.industries || null,
                    other_industries: historyData.other_industries || null,
                    is_worked_with_coach: historyData.is_worked_with_coach !== undefined ? historyData.is_worked_with_coach : null,
                    work_reason: historyData.work_reason || null,
                    coach_reason: historyData.coach_reason || null,
                    coach_area: historyData.coach_area || null,
                    other_area: historyData.other_area || null,
                    working_style: historyData.working_style !== undefined ? historyData.working_style : null,
                    motivation_history: historyData.motivation_history !== undefined ? historyData.motivation_history : null,
                    coach_comments: historyData.coach_comments || null,
                    time_zone: historyData.time_zone || null,
                    other_time_zone: historyData.other_time_zone || null,
                    notes: historyData.notes || null,
                    engagement_type: historyData.engagement_type !== undefined ? historyData.engagement_type : null,
                    other_engagement_type: historyData.other_engagement_type || null,
                    ref_source: historyData.ref_source || null,
                    coach_experience: historyData.coach_experience || null,
                    coach_cred_preference: historyData.coach_cred_preference !== undefined ? historyData.coach_cred_preference : null,
                    coaching_credentials: historyData.coaching_credentials || null,
                    other_coaching_credentials: historyData.other_coaching_credentials || null,
                    range_per_session: historyData.range_per_session || null
                }
            });

            return { client, clientHistory };
        }, { timeout: 20000 });

        return successResponse(res, 201, "Client registered successfully and mail sent to the client", {
            client: new ClientModel(result.client),
            client_history: new ClientHistoryModel(result.clientHistory)
        });

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// GET ALL CLIENTS (pagination & search)
async function getAllClients(req: Request, res: Response) {
    logger.info({ component }, "Get All Clients (POST pagination)");

    try {
        const page = Number(req.body.page ?? 0);
        const itemPerPage = Number(req.body.itemPerPage ?? 0);
        const search = (req.body.search ?? "").trim();
        let sortKey = (req.body.sortKey ?? "first_name").trim();
        if (!["first_name", "email", "created_at"].includes(sortKey)) {
            sortKey = "first_name";
        }
        const sortOrder = (req.body.sortOrder ?? "asc").trim() === "desc" ? "desc" : "asc";

        const noPagination = !page || !itemPerPage;
        const noSearch = search === "";

        const where: any = {};

        // Exclude deleted clients
        where.status = { not: StatusEnum.DELETED };

        const userRole = req.user?.role;

        /* =========================
           ROLE BASED FILTERING
        ========================== */
        if (userRole === "Client") {
            where.user_id = req.user?.id;
        }

        if (userRole === "Coach") {
            const coachId = req.user?.id;

            const coachClients = await prisma.clientPaymentHistory.findMany({
                where: { coach_id: coachId },
                select: { client_id: true }
            });

            const clientIds = coachClients
                .map(c => c.client_id)
                .filter((id): id is string => !!id);

            if (clientIds.length === 0) {
                return successResponse(res, 200, "No records found", {
                    totalCount: 0,
                    items: []
                });
            }

            where.id = { in: clientIds };
        }

        /* =========================
           SEARCH FILTER
        ========================== */
        if (!noSearch) {
            where.OR = [
                { first_name: { contains: search, mode: "insensitive" } },
                { last_name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { mobile: { contains: search, mode: "insensitive" } }
            ];
        }

        /* =========================
           TOTAL COUNT
        ========================== */
        const totalCount = await prisma.client.count({ where });

        /* =========================
           FETCH CLIENTS
        ========================== */
        const query: any = {
            where,
            orderBy: { [sortKey]: sortOrder },
            include: {
                client_history: {
                    orderBy: { created_at: 'desc' },
                    take: 1
                }
            }
        };

        if (!noPagination) {
            query.skip = (page - 1) * itemPerPage;
            query.take = itemPerPage;
        }

        const items = await prisma.client.findMany(query);

        if (!items.length) {
            return successResponse(res, 200, "No records found", {
                totalCount,
                items: []
            });
        }

        const clientIds = items.map(c => c.id);

        /* =========================
           FETCH MAPPINGS
        ========================== */
        const mappings = await prisma.coachesClientMapping.findMany({
            where: { client_id: { in: clientIds } },
            select: {
                client_id: true,
                assigned_coach_ids: true
            }
        });

        /* =========================
           BUILD MAPS
        ========================== */
        const clientCoachMap = new Map<string, string[]>();
        const clientMappingCount = new Map<string, number>();

        mappings.forEach(m => {
            // Count mapping rows
            clientMappingCount.set(
                m.client_id,
                (clientMappingCount.get(m.client_id) || 0) + 1
            );

            const coachIds = Array.isArray(m.assigned_coach_ids)
                ? m.assigned_coach_ids.filter(
                    (id): id is string => typeof id === "string"
                )
                : [];

            if (coachIds.length) {
                const existing = clientCoachMap.get(m.client_id) || [];
                clientCoachMap.set(m.client_id, [...existing, ...coachIds]);
            }
        });

        // Deduplicate coach IDs
        clientCoachMap.forEach((ids, clientId) => {
            clientCoachMap.set(clientId, Array.from(new Set(ids)));
        });

        /* =========================
           FETCH COACH DETAILS
        ========================== */
        const allCoachIds = Array.from(
            new Set(Array.from(clientCoachMap.values()).flat())
        );

        const coaches = await prisma.coach.findMany({
            where: { id: { in: allCoachIds } },
            select: {
                id: true,
                first_name: true,
                middle_name: true,
                last_name: true
            }
        });

        const coachMap = new Map(coaches.map(c => [c.id, c]));

        /* =========================
           FINAL RESPONSE
        ========================== */
        const finalItems = items.map((c: any) => {
            if (c.profile_image) {
                c.profile_image =
                    `${process.env.S3StorageLinkForimages}web/clients/${c.profile_image}`;
            }

            // Flatten client_history array to single object or null
            let history = null;
            if (c.client_history && Array.isArray(c.client_history) && c.client_history.length > 0) {
                history = c.client_history[0];
            }
            c.client_history = history;

            const assignedCoachIds = clientCoachMap.get(c.id) || [];
            const assignedCoaches = assignedCoachIds
                .map(id => coachMap.get(id))
                .filter(Boolean);

            const mappingCount = clientMappingCount.get(c.id) || 0;

            return {
                ...c,
                new_assign: mappingCount === 1 ? 1 : 0, // New assign -1 , Already assign - 2
                assign_coach: assignedCoaches.length ? 1 : 0,  // Assigned - 1, not assigned  - 0
                assigned_coaches: assignedCoaches  // Once assigned that coaches
            };
        });

        return successResponse(res, 200, "Clients fetched successfully", {
            totalCount,
            items: finalItems
        });

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// GET CLIENT BY ID
async function getClientById(req: Request, res: Response) {
    logger.info({ component }, "Get Client By ID");
    try {
        let clientId = req.body.client_id;
        const userRole = req.user?.role;

        // If user is a Client, use their user_id to find their client record
        if (userRole === "Client") {
            const userId = req.user?.id;
            const [errClient, client] = await handle(
                prisma.client.findUnique({
                    where: { user_id: userId },
                    include: {
                        client_history: {
                            orderBy: { created_at: 'desc' },
                            take: 1
                        }
                    }
                })
            );

            if (errClient) return errorResponse(res, 500, "Failed to fetch client data");
            if (!client) return errorResponse(res, 404, "Client not found");
              const requiredHistoryFields = [
            'time_zone', 'other_time_zone', 'current_role', 'leadership_levels',
            'other_leadership_levels', 'coach_experience_in_industry', 'industries',
            'other_industries', 'is_worked_with_coach', 'work_reason', 'coach_reason',
            'coaching_goals', 'other_coaching_goals', 'coaching_time', 'coaching_style',
            'other_coaching_style', 'not_working_coach_style', 'coach_experience',
            'coach_cred_preference', 'coaching_credentials', 'other_coaching_credentials',
            'engagement_type', 'other_engagement_type', 'range_per_session'
        ];
        const missingFields: string[] = [];
        for (const field of requiredHistoryFields) {
            const value = (client.client_history as any)[field];
            // 1. Check for null or undefined
            if (value === null || value === undefined) {
                missingFields.push(field);
                continue;
            }
            // 2. Check for empty strings
            if (typeof value === 'string' && value.trim() === '') {
                missingFields.push(field);
                continue;
            }
            // 3. Check for empty JSON objects or arrays
            if (typeof value === 'object') {
                if (Array.isArray(value) && value.length === 0) {
                    missingFields.push(field);
                } else if (Object.keys(value).length === 0) {
                    missingFields.push(field);
                }
            }
        }
        var missedKey = false
        if (missingFields.length > 0) {
            missedKey = true;
        }
            if (client.profile_image) {
                client.profile_image = `${process.env.S3StorageLinkForimages}web/clients/${client.profile_image}`;
            }

            // Flatten history
            const clientData: any = client;
            if (clientData.client_history && Array.isArray(clientData.client_history) && clientData.client_history.length > 0) {
                clientData.client_history = clientData.client_history[0];
            } else {
                clientData.client_history = null;
            }

            return successResponse(res, 200, "Client fetched successfully", {
                client: new ClientModel(clientData), missedKey: missedKey
            });
        }
        else {   // Admin
            const [err, client] = await handle(
                prisma.client.findUnique({
                    where: { id: clientId },
                    include: {
                        client_history: {
                            orderBy: { created_at: 'desc' },
                            take: 1
                        }
                    }
                })
            );

            if (err) return errorResponse(res, 500, "Failed to fetch client data");
            if (!client) return errorResponse(res, 404, "Client not found");
              const requiredHistoryFields = [
            'time_zone', 'other_time_zone', 'current_role', 'leadership_levels',
            'other_leadership_levels', 'coach_experience_in_industry', 'industries',
            'other_industries', 'is_worked_with_coach', 'work_reason', 'coach_reason',
            'coaching_goals', 'other_coaching_goals', 'coaching_time', 'coaching_style',
            'other_coaching_style', 'not_working_coach_style', 'coach_experience',
            'coach_cred_preference', 'coaching_credentials', 'other_coaching_credentials',
            'engagement_type', 'other_engagement_type', 'range_per_session'
        ];
        const missingFields: string[] = [];
        for (const field of requiredHistoryFields) {
            const value = (client.client_history as any)[field];
            // 1. Check for null or undefined
            if (value === null || value === undefined) {
                missingFields.push(field);
                continue;
            }
            // 2. Check for empty strings
            if (typeof value === 'string' && value.trim() === '') {
                missingFields.push(field);
                continue;
            }
            // 3. Check for empty JSON objects or arrays
            if (typeof value === 'object') {
                if (Array.isArray(value) && value.length === 0) {
                    missingFields.push(field);
                } else if (Object.keys(value).length === 0) {
                    missingFields.push(field);
                }
            }
        }
        var missedKey = false
        if (missingFields.length > 0) {
            missedKey = true;
        }
            if (client.profile_image) {
                client.profile_image = `${process.env.S3StorageLinkForimages}web/clients/${client.profile_image}`;
            }

            // Flatten history
            const clientData: any = client;
            if (clientData.client_history && Array.isArray(clientData.client_history) && clientData.client_history.length > 0) {
                clientData.client_history = clientData.client_history[0];
            } else {
                clientData.client_history = null;
            }

            return successResponse(res, 200, "Client fetched successfully", {
                client: new ClientModel(clientData), missedKey: missedKey
                // client_history: client.client_history ? new ClientHistoryModel(client.client_history) : null
            });
        }

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}


// UPDATE CLIENT
async function updateClient(req: Request, res: Response) {
    logger.info({ component }, "Update Client API Called", req.body);
    try {
        const id = req.params.id;
        if (!id) {
            return errorResponse(res, 400, "Client ID is required");
        }

        const {
            first_name,
            last_name,
            middle_name,
            email,
            country_code,
            mobile,
            city,
            linked_in_url,
            website_url,
            notes,
            status,
            profile_image,
            client_history
        } = req.body;

        // Check if client exists
        const existingClient = await prisma.client.findUnique({ where: { id } });
        if (!existingClient) {
            return errorResponse(res, 404, "Client not found");
        }

        // Run in transaction
        const result = await prisma.$transaction(async (tx) => {
            // Update client
            const clientPayload: any = {};
            if (first_name !== undefined) clientPayload.first_name = first_name;
            if (last_name !== undefined) clientPayload.last_name = last_name;
            if (middle_name !== undefined) clientPayload.middle_name = middle_name;
            if (email !== undefined) clientPayload.email = email;
            if (country_code !== undefined) clientPayload.country_code = country_code;
            if (mobile !== undefined) clientPayload.mobile = mobile;
            if (city !== undefined) clientPayload.city = city;
            if (linked_in_url !== undefined) clientPayload.linked_in_url = linked_in_url;
            if (website_url !== undefined) clientPayload.website_url = website_url;
            if (notes !== undefined) clientPayload.notes = notes;
            if (status !== undefined) clientPayload.status = status;

            // Handle image update
            if (profile_image && profile_image.startsWith("data:image")) {
                const base64String = profile_image.split(",")[1];
                const sizeMB = calculateBase64Size(base64String);

                if (sizeMB > 2) {
                    throw new Error("Image exceeds 2MB");
                }

                const uploaded = await profilePictureUpload({
                    id,
                    image_url: profile_image
                });

                clientPayload.profile_image = uploaded.key;
            }

            const updatedClient = await tx.client.update({
                where: { id },
                data: clientPayload
            });

            // Update client history if provided
            let updatedHistory = null;
            if (client_history) {
                const historyPayload: any = {};
                if (client_history.support_seek !== undefined)
                    historyPayload.support_seek = client_history.support_seek;

                if (client_history.coaching_goals !== undefined)
                    historyPayload.coaching_goals = client_history.coaching_goals;

                if (client_history.coaching_time !== undefined)
                    historyPayload.coaching_time = client_history.coaching_time;

                if (client_history.coaching_style !== undefined)
                    historyPayload.coaching_style = client_history.coaching_style;

                if (client_history.not_working_coach_style !== undefined)
                    historyPayload.not_working_coach_style = client_history.not_working_coach_style;

                if (client_history.notes !== undefined)
                    historyPayload.notes = client_history.notes;

                if (client_history.engagement_type !== undefined)
                    historyPayload.engagement_type = client_history.engagement_type;

                if (client_history.other_engagement_type !== undefined)
                    historyPayload.other_engagement_type = client_history.other_engagement_type;

                if (client_history.ref_source !== undefined)
                    historyPayload.ref_source = client_history.ref_source;

                if (client_history.coach_cred_preference !== undefined)
                    historyPayload.coach_cred_preference = client_history.coach_cred_preference;

                if (client_history.other_coaching_credentials !== undefined)
                    historyPayload.other_coaching_credentials = client_history.other_coaching_credentials;

                if (client_history.current_role !== undefined) historyPayload.current_role = client_history.current_role;
                if (client_history.industries !== undefined) historyPayload.industries = client_history.industries;
                if (client_history.other_industries !== undefined) historyPayload.other_industries = client_history.other_industries;
                if (client_history.is_worked_with_coach !== undefined) historyPayload.is_worked_with_coach = client_history.is_worked_with_coach;
                if (client_history.work_reason !== undefined) historyPayload.work_reason = client_history.work_reason;
                if (client_history.coach_reason !== undefined) historyPayload.coach_reason = client_history.coach_reason;
                if (client_history.coach_area !== undefined) historyPayload.coach_area = client_history.coach_area;
                if (client_history.other_area !== undefined) historyPayload.other_area = client_history.other_area;
                if (client_history.time_zone !== undefined) historyPayload.time_zone = client_history.time_zone;
                if (client_history.leadership_levels !== undefined) historyPayload.leadership_levels = client_history.leadership_levels;
                if (client_history.working_style !== undefined) historyPayload.working_style = client_history.working_style;
                if (client_history.motivation_history !== undefined) historyPayload.motivation_history = client_history.motivation_history;
                if (client_history.coach_comments !== undefined) historyPayload.coach_comments = client_history.coach_comments;
                if (client_history.coach_experience !== undefined) historyPayload.coach_experience = client_history.coach_experience;
                if (client_history.coaching_credentials !== undefined) historyPayload.coaching_credentials = client_history.coaching_credentials;
                if (client_history.range_per_session !== undefined) historyPayload.range_per_session = client_history.range_per_session;

                // Check if history exists

                const existingHistory = await tx.clientHistory.findFirst({
                    where: { client_id: id },
                    orderBy: { created_at: "desc" }
                });

                let createNewHistory = false;

                if (existingHistory) {
                    const oldIndustries = JSON.stringify(existingHistory.industries);
                    const newIndustries = client_history.industries !== undefined ? JSON.stringify(client_history.industries) : oldIndustries;

                    // const oldTimeZone = existingHistory.time_zone;
                    // const newTimeZone = client_history.time_zone !== undefined ? client_history.time_zone : oldTimeZone;

                    const oldLevel = JSON.stringify(existingHistory.leadership_levels);
                    const newLevel = client_history.leadership_levels !== undefined ? JSON.stringify(client_history.leadership_levels) : oldLevel;

                    const oldRange = JSON.stringify(existingHistory.range_per_session);
                    const newRange = client_history.range_per_session !== undefined ? JSON.stringify(client_history.range_per_session) : oldRange;

                    // If any of the tracked fields changed, flag to create new history
                    if (oldIndustries !== newIndustries || oldLevel !== newLevel || oldRange !== newRange) {
                        createNewHistory = true;
                    }
                } else {
                    // No existing history, so we must create one
                    createNewHistory = true;
                }

                if (createNewHistory) {
                    // Create NEW history record
                    // If existing history, we might want to copy over old values for fields NOT provided?
                    // Use spread of existing history (excluding IDs) + new payload

                    let baseData: any = {};
                    if (existingHistory) {
                        const { id: _id, created_at: _c, updated_at: _u, client_id: _cid, ...rest } = existingHistory;
                        baseData = rest;
                    }

                    updatedHistory = await tx.clientHistory.create({
                        data: {
                            ...baseData,
                            ...historyPayload,
                            client_id: id
                        }
                    });
                } else {
                    // Update EXISTING LATEST history
                    updatedHistory = await tx.clientHistory.update({
                        where: { id: existingHistory!.id },
                        data: historyPayload
                    });
                }
            }

            return { client: updatedClient, clientHistory: updatedHistory };
        }, { timeout: 20000 });

        return successResponse(
            res,
            200,
            "Client updated successfully",
            {
                client: new ClientModel(result.client),
                client_history: result.clientHistory ? new ClientHistoryModel(result.clientHistory) : null
            }
        );
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}


// DELETE CLIENT (soft delete)
async function deleteClient(req: Request, res: Response) {
    logger.info({ component }, "Delete Client");
    try {
        const id = req.params.id;
        if (!id) {
            return errorResponse(res, 400, "Client ID is required");
        }

        const [err, deleted] = await handle(
            prisma.client.update({
                where: { id },
                data: { status: StatusEnum.DELETED }
            })
        );

        if (err) {
            return errorResponse(res, 500, "Failed to delete client");
        }
        if (!deleted) {
            return errorResponse(res, 404, "Client not found");
        }

        return successResponse(res, 200, "Client deleted successfully");
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// ENABLE / DISABLE CLIENT
async function enableDisableClient(req: Request, res: Response) {
    logger.info({ component }, "Toggle Client Status");
    try {
        const id = req.params.id;
        const { status } = req.body;

        if (!id) {
            return errorResponse(res, 400, "Client ID is required");
        }
        if (status === undefined || status === null) {
            return errorResponse(res, 400, "Status is required (ACTIVE or INACTIVE)");
        }
        if (![StatusEnum.INACTIVE, StatusEnum.ACTIVE].includes(status)) {
            return errorResponse(res, 400, "Invalid status value, must be 0 (INACTIVE) or 1 (ACTIVE)");
        }

        const client = await prisma.client.findUnique({ where: { id } });
        if (!client) {
            return errorResponse(res, 404, "Client not found");
        }

        // Update client status
        const updated = await prisma.client.update({
            where: { id },
            data: { status }
        });

        return successResponse(
            res,
            200,
            `Client ${status === StatusEnum.ACTIVE ? "enabled" : "disabled"} successfully`,
            { id, status }
        );
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Get all Client History
async function getAllClients_History(req: Request, res: Response) {
    try {
        const authClientId = (req as any).user?.id;
        if (!authClientId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const clientDetails = await prisma.client.findUnique({
            where: { user_id: authClientId }
        });

        if (!clientDetails) {
            return res.status(404).json({ message: "Client profile not found" });
        }
        const client_id = clientDetails.id;

        let sortKey = (req.body.sortKey ?? "created_at").trim();
        let sortOrder = (req.body.sortOrder ?? "desc").trim().toLowerCase();
        if (!["asc", "desc"].includes(sortOrder)) sortOrder = "desc";

        const histories = await prisma.clientHistory.findMany({
            where: { client_id: client_id },
            orderBy: { [sortKey]: sortOrder }
        });
        if (histories.length === 0) {
            return res.status(200).json({ status: true, data: [], message: "No Data Found in Client History" });
        }
        const historyIds = histories.map((h: { id: any; }) => h.id);
        const mappings = await prisma.coachesClientMapping.findMany({
            where: { client_history_id: { in: historyIds } }
        });
        const allCoachIds: string[] = [...new Set(
            mappings.flatMap((m: any) =>
                ((m.assigned_coach_ids || []) as any[]).map((c: any) => String(c.id))
            )
        )];
        const coaches = await prisma.coach.findMany({
            where: { id: { in: allCoachIds } }
        });
        const result = histories.map(history => {
            const mapping = mappings.find((m: any) => m.client_history_id === history.id);
            let coach_mapping_details = null;
            if (mapping) {
                coach_mapping_details = {
                    id: mapping.id,
                    client_id: mapping.client_id,
                    assigned_by_admin_id: mapping.assigned_by_admin_id,
                    assigned_by_staff_id: mapping.assigned_by_staff_id,
                    primary_coach_id: mapping.primary_coach_id,
                    client_history_id: mapping.client_history_id,
                    reason: mapping.reason,
                    created_at: mapping.created_at,
                    updated_at: mapping.updated_at,
                    assigned_coach_details: ((mapping.assigned_coach_ids || []) as any[]).map((assigned: any) => {
                        const coachInfo = coaches.find((c: any) => c.id === assigned.id);
                        return {
                            id: assigned.id,
                            selected: assigned.selected || false,
                            coach_details: coachInfo || null
                        };
                    })
                };
            }
            return {
                ...history,
                coach_mapping_details
            };
        });
        return res.status(200).json({
            status: true,
            data: result,
            message: "Client History fetched successfully"
        });
    } catch (error) {
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

// Get all client payment history
async function getAllClientsPaymentHistory(req: Request, res: Response) {
    logger.info({ component }, "Get All Clients Payment History");

    try {
        const page = Number(req.body.page ?? 1);
        const itemPerPage = Number(req.body.itemPerPage ?? 10);
        const coach_id = (req.body.coach_id ?? "").trim();

        const skip = (page - 1) * itemPerPage;
        const take = itemPerPage;


        const whereCondition: any = {
            is_paid: 1
        };

        // Apply coach filter ONLY if coach_id is provided
        if (coach_id !== "") {
            whereCondition.coach_id = coach_id;
        }


        const [totalCount, payments] = await Promise.all([
            prisma.clientPaymentHistory.count({
                where: whereCondition
            }),
            prisma.clientPaymentHistory.findMany({
                where: whereCondition,
                skip,
                take,
                orderBy: (function () {
                    const sortKey = req.body.sortKey ? String(req.body.sortKey).trim() : "created_at";
                    const sortOrder: "asc" | "desc" = (req.body.sortOrder ? String(req.body.sortOrder).trim().toLowerCase() : "desc") === "asc" ? "asc" : "desc";

                    if (sortKey === "payment_date") return { payment_Date: sortOrder };
                    if (sortKey === "coach_name") return { coach: { first_name: sortOrder } };
                    if (sortKey === "client_name") return { client: { first_name: sortOrder } };

                    // Default fallback for other keys
                    return { [sortKey]: sortOrder };
                })() as any,
                include: {
                    coach: {
                        select: {
                            first_name: true,
                            middle_name: true,
                            last_name: true
                        }
                    },
                    client: {
                        select: {
                            first_name: true,
                            middle_name: true,
                            last_name: true
                        }
                    }
                }
            })
        ]);

        if (!payments || payments.length === 0) {
            return res.status(200).json({
                status: true,
                statusCode: 200,
                data: [],
                message: "No records found"
            });
        }

        const formattedData = (payments as any[]).map(p => ({
            id: p.id,
            coach_id: p.coach_id,
            client_id: p.client_id,
            appointment_id: p.appointment_id,
            map_id: p.map_id,
            appointment_start_date: p.appointment_start_date,
            appointment_end_date: p.appointment_end_date,
            payment_date: p.payment_Date,
            amount: p.amount,
            currency: p.currency,
            is_paid: p.is_paid,

            coach_name: p.coach
                ? [p.coach.first_name, p.coach.middle_name, p.coach.last_name]
                    .filter(Boolean)
                    .join(" ")
                : null,

            client_name: p.client
                ? [p.client.first_name, p.client.middle_name, p.client.last_name]
                    .filter(Boolean)
                    .join(" ")
                : null,

            created_at: p.created_at
        }));

        return res.status(200).json({
            status: true,
            message: "Client payment history fetched successfully",
            totalCount,
            data: formattedData
        });

    } catch (error) {
        logger.error(error);
        return res.status(500).json({
            status: false,
            message: "Internal server error"
        });
    }
}


// Get Clients For Coach
async function getClientsForCoach(req: Request, res: Response) {
    logger.info({ component }, "Get Clients For Coach");
    try {
        const page = Number(req.body.page ?? 1);
        const limit = Number(req.body.itemPerPage ?? 10);
        const search = req.body.search ? String(req.body.search).trim() : "";

        let sortKey = req.body.sortKey ? String(req.body.sortKey).trim() : "first_name";
        let sortOrder = req.body.sortOrder ? String(req.body.sortOrder).trim().toLowerCase() : "asc";

        if (sortOrder !== "desc") sortOrder = "asc";

        // Map user friendly sort keys to internal keys
        if (sortKey === "upcoming_meeting_date") sortKey = "upcoming_appointment_date";
        if (sortKey === "last_meeting_date") sortKey = "last_appointment_date";

        const isCalculatedSort = ["upcoming_appointment_date", "last_appointment_date", "total_meetings_attended", "agreed_session_rate"].includes(sortKey);

        const user = (req as any).user;
        let coach_id = req.body.coach_id;

        // Auto-detect coach_id if user is Coach
        if (user.role === 'Coach') {
            const coachProfile = await prisma.coach.findUnique({ where: { user_id: user.id } });
            if (!coachProfile) return errorResponse(res, 404, "Coach profile not found");
            coach_id = coachProfile.id;
        }

        if (!coach_id) {
            return errorResponse(res, 400, "Coach ID is required");
        }

        const coachDetails = await prisma.coach.findUnique({
            where: { id: String(coach_id) },
            select: { first_name: true, middle_name: true, last_name: true }
        });

        if (!coachDetails) {
            return errorResponse(res, 404, "Coach not found");
        }

        const where: any = {
            appointments: {
                some: { coach_id: String(coach_id) }
            }
        };

        if (search) {
            const searchConditions: any[] = [
                { first_name: { contains: search, mode: 'insensitive' } },
                { last_name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];

            // Attempt to parse search string as a date
            const searchStr = String(search).trim();

            // Regex for Year (YYYY)
            // Regex for Year (YYYY)
            const yearRegex = /^\d{4}$/;
            // Regex for Year-Month (YYYY-MM or YYYY/MM)
            const monthRegex = /^(\d{4})[-/](0?[1-9]|1[0-2])$/;
            // Regex for Partial Date (YYYY-MM-D) where D is 0-3 (representing decades of days 0x, 1x, 2x, 3x)
            const partialDateRegex = /^(\d{4})[-/](0?[1-9]|1[0-2])[-/]([0-3])$/;

            if (yearRegex.test(searchStr)) {
                const year = parseInt(searchStr);
                const startOfYear = new Date(year, 0, 1); // Jan 1st 00:00
                const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999); // Dec 31st 23:59:59

                searchConditions.push({
                    appointments: {
                        some: {
                            coach_id: String(coach_id),
                            scheduled_start: {
                                gte: startOfYear,
                                lte: endOfYear
                            }
                        }
                    }
                });
            } else if (monthRegex.test(searchStr)) {
                const match = searchStr.match(monthRegex);
                if (match) {
                    const year = parseInt(match[1]!);
                    const monthPart = match[2]!;

                    if (monthPart === '1') {
                        // Special case: "2025-1" matches "2025-10", "2025-11", "2025-12"
                        // Search range: Oct 1 to Dec 31
                        const startOfPeriod = new Date(year, 9, 1); // Oct 1 (Index 9)
                        const endOfPeriod = new Date(year, 11, 31, 23, 59, 59, 999); // Dec 31

                        searchConditions.push({
                            appointments: {
                                some: {
                                    coach_id: String(coach_id),
                                    scheduled_start: {
                                        gte: startOfPeriod,
                                        lte: endOfPeriod
                                    }
                                }
                            }
                        });
                    } else {
                        const month = parseInt(monthPart) - 1; // JS months are 0-indexed (0-11)

                        const startOfMonth = new Date(year, month, 1);
                        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

                        searchConditions.push({
                            appointments: {
                                some: {
                                    coach_id: String(coach_id),
                                    scheduled_start: {
                                        gte: startOfMonth,
                                        lte: endOfMonth
                                    }
                                }
                            }
                        });
                    }
                }
            } else if (partialDateRegex.test(searchStr)) {
                // Handle YYYY-MM-D (e.g. 2025-12-2 -> 20s)
                const match = searchStr.match(partialDateRegex);
                if (match) {
                    const year = parseInt(match[1]!);
                    const month = parseInt(match[2]!) - 1; // 0-indexed
                    const dayPrefix = parseInt(match[3]!);

                    let startDay = dayPrefix * 10;
                    if (startDay === 0) startDay = 1; // 0 matches 01-09

                    const endDay = (dayPrefix * 10) + 9;

                    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

                    // Validate if range is within month
                    if (startDay <= lastDayOfMonth) {
                        const finalEndDay = Math.min(endDay, lastDayOfMonth);

                        const startOfRange = new Date(year, month, startDay);
                        const endOfRange = new Date(year, month, finalEndDay, 23, 59, 59, 999);

                        searchConditions.push({
                            appointments: {
                                some: {
                                    coach_id: String(coach_id),
                                    scheduled_start: {
                                        gte: startOfRange,
                                        lte: endOfRange
                                    }
                                }
                            }
                        });
                    }
                }
            } else {
                // Try standard date parsing (e.g. YYYY-MM-DD or other formats)
                const searchDate = new Date(searchStr);
                if (!isNaN(searchDate.getTime())) {
                    const startOfDay = new Date(searchDate);
                    startOfDay.setHours(0, 0, 0, 0);

                    const endOfDay = new Date(searchDate);
                    endOfDay.setHours(23, 59, 59, 999);

                    searchConditions.push({
                        appointments: {
                            some: {
                                coach_id: String(coach_id),
                                scheduled_start: {
                                    gte: startOfDay,
                                    lte: endOfDay
                                }
                            }
                        }
                    });
                }
            }

            where.OR = searchConditions;
        }

        const totalCount = await prisma.client.count({ where });

        // Query setup
        const queryOptions: any = {
            where,
            include: {
                appointments: {
                    where: { coach_id: String(coach_id) },
                    select: {
                        id: true,
                        scheduled_start: true,
                        status: true,
                        feedbacks: true,
                        client_notes: true
                    },
                    orderBy: { scheduled_start: 'desc' }
                }
            }
        };

        // If NOT calculated sort, apply DB pagination & sorting
        if (!isCalculatedSort) {
            queryOptions.skip = (page - 1) * limit;
            queryOptions.take = limit;
            queryOptions.orderBy = { [sortKey]: sortOrder };
        }

        const clients = await prisma.client.findMany(queryOptions);

        // Process logic
        let formattedClients = clients.map((client: any) => {
            const appointments = client.appointments;

            // 2 = COMPLETED
            const completedCount = appointments.filter((a: any) => a.status === 2).length;

            const now = new Date();

            const validAppointments = appointments.filter((a: any) => a.status !== 3); // 3=Cancelled
            const future = validAppointments.filter((a: any) => new Date(a.scheduled_start) > now);
            const past = validAppointments.filter((a: any) => new Date(a.scheduled_start) <= now);

            // Upcoming = Closest future date (Sort ASC)
            future.sort((a: any, b: any) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime());

            // Last = Closest past date (Sort DESC)
            past.sort((a: any, b: any) => new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime());

            const upcoming_appointment_date = future.length > 0 ? future[0]?.scheduled_start : null;
            const last_appointment = past.length > 0 ? past[0] : null;
            const last_appointment_date = last_appointment?.scheduled_start || null;

            // Get feedback for the last appointment
            const client_notes = last_appointment?.client_notes || null;

            const { appointments: _, ...clientData } = client;

            return {
                ...clientData,
                total_meetings_attended: completedCount,
                upcoming_appointment_date,
                last_appointment_date,
                client_evaluation: client_notes,
                agreed_session_rate: 400
            };
        });

        // If calculated sort, apply In-Memory Sorting & Pagination
        if (isCalculatedSort) {
            formattedClients.sort((a: any, b: any) => {
                let valA = a[sortKey];
                let valB = b[sortKey];

                if (sortKey === "upcoming_appointment_date" || sortKey === "last_appointment_date") {
                    // Handle null dates (put them last usually, or first depending on logic)
                    // Let's assume nulls go to the bottom for desc, top for asc? Or standard:
                    const dateA = valA ? new Date(valA).getTime() : 0;
                    const dateB = valB ? new Date(valB).getTime() : 0;
                    return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
                }

                if (sortKey === "agreed_session_rate") {
                    return sortOrder === "asc" ? (valA - valB) : (valB - valA);
                }

                // Numeric sort for total_meetings_attended
                return sortOrder === "asc" ? (valA - valB) : (valB - valA);
            });

            // Pagination slice
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            formattedClients = formattedClients.slice(startIndex, endIndex);
        }

        return successResponse(res, 200, "Coach clients fetched successfully", {
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            coach_details: {
                first_name: coachDetails.first_name || null,
                middle_name: coachDetails.middle_name || null,
                last_name: coachDetails.last_name || null
            },
            items: formattedClients
        });

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}


async function getCoachesForClient(req: Request, res: Response) {
    logger.info({ component }, "Get Coaches For Client");
    try {
        const page = Number(req.body.page ?? 1);
        const limit = Number(req.body.itemPerPage ?? 10);
        const search = req.body.search ? String(req.body.search).trim() : "";

        let sortKey = req.body.sortKey ? String(req.body.sortKey).trim() : "first_name";
        let sortOrder = req.body.sortOrder ? String(req.body.sortOrder).trim().toLowerCase() : "asc";

        if (sortOrder !== "desc") sortOrder = "asc";

        // Map user friendly sort keys to internal keys
        if (sortKey === "upcoming_meeting_date") sortKey = "upcoming_appointment_date";
        if (sortKey === "last_meeting_date") sortKey = "last_appointment_date";

        const isCalculatedSort = ["upcoming_appointment_date", "last_appointment_date", "total_meetings_attended", "agreed_session_rate"].includes(sortKey);

        const user = (req as any).user;
        let client_id = req.body.client_id;

        // Auto-detect client_id if user is Client
        if (user.role === 'Client') {
            const clientProfile = await prisma.client.findUnique({ where: { user_id: user.id } });
            if (!clientProfile) return errorResponse(res, 404, "Client profile not found");
            client_id = clientProfile.id;
        }

        if (!client_id) {
            return errorResponse(res, 400, "Client ID is required");
        }

        const clientDetails = await prisma.client.findUnique({
            where: { id: String(client_id) },
            select: { first_name: true, middle_name: true, last_name: true }
        });

        const where: any = {
            appointments: {
                some: { client_id: String(client_id) }
            }
        };

        if (search) {
            const searchConditions: any[] = [
                { first_name: { contains: search, mode: 'insensitive' } },
                { last_name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];

            // Attempt to parse search string as a date
            const searchStr = String(search).trim();
            const yearRegex = /^\d{4}$/;
            const monthRegex = /^(\d{4})[-/](0?[1-9]|1[0-2])$/;
            const partialDateRegex = /^(\d{4})[-/](0?[1-9]|1[0-2])[-/]([0-3])$/;

            if (yearRegex.test(searchStr)) {
                const year = parseInt(searchStr);
                const startOfYear = new Date(year, 0, 1); // Jan 1st 00:00
                const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999); // Dec 31st 23:59:59

                searchConditions.push({
                    appointments: {
                        some: {
                            client_id: String(client_id),
                            scheduled_start: {
                                gte: startOfYear,
                                lte: endOfYear
                            }
                        }
                    }
                });
            } else if (monthRegex.test(searchStr)) {
                const match = searchStr.match(monthRegex);
                if (match) {
                    const year = parseInt(match[1]!);
                    const monthPart = match[2]!;

                    if (monthPart === '1') {
                        // Special case: "2025-1" matches "2025-10", "2025-11", "2025-12"
                        const startOfPeriod = new Date(year, 9, 1); // Oct 1 (Index 9)
                        const endOfPeriod = new Date(year, 11, 31, 23, 59, 59, 999); // Dec 31

                        searchConditions.push({
                            appointments: {
                                some: {
                                    client_id: String(client_id),
                                    scheduled_start: {
                                        gte: startOfPeriod,
                                        lte: endOfPeriod
                                    }
                                }
                            }
                        });
                    } else {
                        const month = parseInt(monthPart) - 1;

                        const startOfMonth = new Date(year, month, 1);
                        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

                        searchConditions.push({
                            appointments: {
                                some: {
                                    client_id: String(client_id),
                                    scheduled_start: {
                                        gte: startOfMonth,
                                        lte: endOfMonth
                                    }
                                }
                            }
                        });
                    }
                }
            } else if (partialDateRegex.test(searchStr)) {
                const match = searchStr.match(partialDateRegex);
                if (match) {
                    const year = parseInt(match[1]!);
                    const month = parseInt(match[2]!) - 1;
                    const dayPrefix = parseInt(match[3]!);

                    let startDay = dayPrefix * 10;
                    if (startDay === 0) startDay = 1;

                    const endDay = (dayPrefix * 10) + 9;

                    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

                    // Validate if range is within month
                    if (startDay <= lastDayOfMonth) {
                        const finalEndDay = Math.min(endDay, lastDayOfMonth);

                        const startOfRange = new Date(year, month, startDay);
                        const endOfRange = new Date(year, month, finalEndDay, 23, 59, 59, 999);

                        searchConditions.push({
                            appointments: {
                                some: {
                                    client_id: String(client_id),
                                    scheduled_start: {
                                        gte: startOfRange,
                                        lte: endOfRange
                                    }
                                }
                            }
                        });
                    }
                }
            } else {
                // Try standard date parsing
                const searchDate = new Date(searchStr);
                if (!isNaN(searchDate.getTime())) {
                    const startOfDay = new Date(searchDate);
                    startOfDay.setHours(0, 0, 0, 0);

                    const endOfDay = new Date(searchDate);
                    endOfDay.setHours(23, 59, 59, 999);

                    searchConditions.push({
                        appointments: {
                            some: {
                                client_id: String(client_id),
                                scheduled_start: {
                                    gte: startOfDay,
                                    lte: endOfDay
                                }
                            }
                        }
                    });
                }
            }

            where.OR = searchConditions;
        }

        const totalCount = await prisma.coach.count({ where });

        // Query setup
        const queryOptions: any = {
            where,
            include: {
                appointments: {
                    where: { client_id: String(client_id) },
                    select: {
                        id: true,
                        scheduled_start: true,
                        status: true,
                        feedbacks: true
                    },
                    orderBy: { scheduled_start: 'desc' }
                }
            }
        };

        // If NOT calculated sort, apply DB pagination & sorting
        if (!isCalculatedSort) {
            queryOptions.skip = (page - 1) * limit;
            queryOptions.take = limit;
            queryOptions.orderBy = { [sortKey]: sortOrder };
        }

        const coaches = await prisma.coach.findMany(queryOptions);

        // Process logic
        let formattedCoaches = coaches.map((coach: any) => {
            const appointments = coach.appointments;

            // 2 = COMPLETED
            const completedCount = appointments.filter((a: any) => a.status === 2).length;

            const now = new Date();

            const validAppointments = appointments.filter((a: any) => a.status !== 3); // 3=Cancelled
            const future = validAppointments.filter((a: any) => new Date(a.scheduled_start) > now);
            const past = validAppointments.filter((a: any) => new Date(a.scheduled_start) <= now);

            // Upcoming = Closest future date (Sort ASC)
            future.sort((a: any, b: any) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime());

            // Last = Closest past date (Sort DESC)
            past.sort((a: any, b: any) => new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime());

            const upcoming_appointment_date = future.length > 0 ? future[0]?.scheduled_start : null;
            const last_appointment = past.length > 0 ? past[0] : null;
            const last_appointment_date = last_appointment?.scheduled_start || null;

            // Get feedback for the last appointment
            const coach_feedback = last_appointment?.feedbacks?.[0] || null;

            // Handle Image URL mapping
            let image_url = coach.image_url;
            if (image_url) {
                image_url = `${process.env.S3StorageLinkForimages}web/doctors/${image_url}`;
            }

            const { appointments: _, ...coachData } = coach;

            return {
                ...coachData,
                image_url,
                total_meetings_attended: completedCount,
                upcoming_appointment_date,
                last_appointment_date,
                coach_evaluation: coach_feedback,
                agreed_session_rate: 400
            };
        });

        // If calculated sort, apply In-Memory Sorting & Pagination
        if (isCalculatedSort) {
            formattedCoaches.sort((a: any, b: any) => {
                let valA = a[sortKey];
                let valB = b[sortKey];

                if (sortKey === "upcoming_appointment_date" || sortKey === "last_appointment_date") {
                    // Handle null dates. 
                    // For 'desc': latest date first. null last?
                    // For 'asc': earliest date first. null last?
                    // Let's assume null is "no date", so semantically it might be 0 or infinity?
                    // Let's treat null as 0 timestamp (1970).
                    const dateA = valA ? new Date(valA).getTime() : 0;
                    const dateB = valB ? new Date(valB).getTime() : 0;
                    return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
                }

                if (sortKey === "agreed_session_rate") {
                    return sortOrder === "asc" ? (valA - valB) : (valB - valA);
                }

                // Numeric sort for total_meetings_attended
                return sortOrder === "asc" ? (valA - valB) : (valB - valA);
            });

            // Pagination slice
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            formattedCoaches = formattedCoaches.slice(startIndex, endIndex);
        }

        return successResponse(res, 200, "Client coaches fetched successfully", {
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            clientDetails: clientDetails,
            items: formattedCoaches
        });

    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

export default {
    createClient,
    getAllClients,
    getClientById,
    updateClient,
    deleteClient,
    enableDisableClient,
    getAllClients_History,
    getAllClientsPaymentHistory,
    getClientsForCoach,
    getCoachesForClient
};
