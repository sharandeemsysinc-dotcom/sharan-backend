import { Request, Response } from "express";
import prisma from "../config/prisma";
import { FeedbackModel } from "../models/feedback";
import logger from "../utils/logger";
import { successResponse, errorResponse } from "../utils/responseHandler";

const component = "Feedback Controller";

// Handle Async Wrapper
async function handle<T>(promise: Promise<T>): Promise<[any, T | undefined]> {
    try {
        const data = await promise;
        return [null, data];
    } catch (error) {
        return [error, undefined];
    }
}

// Create Feedback
async function createFeedback(req: Request, res: Response) {
    logger.info({ component }, "Create Feedback");
    try {
        const {
            appointment_id,
            coach_id,
            rating,
            coach_Comfort_Level,
            coach_Understanding,
            style_and_Approach,
            felt_Supported,
            like_to_proceed,
            positive_or_negative_about_conversation,
            move_Forward_Decision_Question,
            overall_experience,
            effectiveness,
            style_fit_over_time,
            coach_feedback,
            is_first_appointment
        } = req.body;
        const client_user_id = req.user.id;
        if (!appointment_id) return errorResponse(res, 400, "Appointment ID is required");
        if (!coach_id) return errorResponse(res, 400, "Coach ID is required");
        const appointment = await prisma.appointment.findUnique({ where: { id: appointment_id } });
        if (!appointment) {
            return errorResponse(res, 404, "Appointment not found");
        }
        const coach = await prisma.coach.findUnique({ where: { id: coach_id } });
        if (!coach) {
            return errorResponse(res, 404, "Coach not found");
        }
        const client = await prisma.client.findUnique({ where: { user_id: client_user_id } });
        if (!client) {
            return errorResponse(res, 404, "Client not found");
        }
        const client_id = client.id;
        const [err, feedback] = await handle(
            prisma.feedback.create({
                data: {
                    appointment_id,
                    coach_id,
                    client_id,
                    rating: Number(rating),
                    status: 1,
                    coach_Comfort_Level: Number(coach_Comfort_Level),
                    coach_Understanding: Number(coach_Understanding),
                    style_and_Approach: Number(style_and_Approach),
                    felt_Supported: Number(felt_Supported),
                    like_to_proceed: Number(like_to_proceed),
                    positive_or_negative_about_conversation,
                    move_Forward_Decision_Question,
                    overall_experience: Number(overall_experience),
                    effectiveness: Number(effectiveness),
                    style_fit_over_time: Number(style_fit_over_time),
                    coach_feedback,
                    is_first_appointment
                },
            })
        );
        if (err) {
            logger.error({ component }, err);
            return errorResponse(res, 500, "Failed to create feedback");
        }
        return successResponse(res, 201, "Feedback created successfully", feedback);
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Get All Feedback with Filters & Pagination
async function getAllFeedback(req: Request, res: Response) {
    logger.info({ component }, "Get All Feedback");
    try {
        const {
            page,
            itemsPerPage,
            coach_id,
            search,
            sort_by,
            sort_order
        } = req.body;
        if (!coach_id) {
            return errorResponse(res, 400, "Coach ID is mandatory.");
        }
        const where: any = {
            coach_id: coach_id,
            status: { not: 2 }
        };
        // --- SEARCH LOGIC ---
        if (search) {
            const searchStr = String(search).trim();
            const searchConditions: any[] = [
                // Client Name Search
                { client: { first_name: { contains: searchStr, mode: 'insensitive' } } },
                { client: { middle_name: { contains: searchStr, mode: 'insensitive' } } },
                { client: { last_name: { contains: searchStr, mode: 'insensitive' } } },
            ];
            // Rating Search
            if (!isNaN(Number(searchStr))) {
                searchConditions.push({ rating: Number(searchStr) });
            }
            // Session Type Search (Mapping string search to boolean field)
            if (searchStr.toLowerCase().includes("first") || searchStr.toLowerCase().includes("intro")) {
                searchConditions.push({ is_first_appointment: true });
            } else if (searchStr.toLowerCase().includes("follow-up") || searchStr.toLowerCase().includes("ongoing")) {
                searchConditions.push({ is_first_appointment: false });
            }
            // Advanced Date Regex Logic for Session Date (appointment.scheduled_start)
            const yearRegex = /^\d{4}$/;
            const monthRegex = /^(\d{4})[-/](0?[1-9]|1[0-2])$/;
            if (yearRegex.test(searchStr)) {
                const year = parseInt(searchStr);
                searchConditions.push({
                    appointment: {
                        scheduled_start: {
                            gte: new Date(year, 0, 1),
                            lte: new Date(year, 11, 31, 23, 59, 59, 999)
                        }
                    }
                });
            } else if (monthRegex.test(searchStr)) {
                const match = searchStr.match(monthRegex);
                if (match) {
                    const year = parseInt(match[1]!);
                    const month = parseInt(match[2]!) - 1;
                    searchConditions.push({
                        appointment: {
                            scheduled_start: {
                                gte: new Date(year, month, 1),
                                lte: new Date(year, month + 1, 0, 23, 59, 59, 999)
                            }
                        }
                    });
                }
            } else {
                const searchDate = new Date(searchStr);
                if (!isNaN(searchDate.getTime())) {
                    const startOfDay = new Date(searchDate);
                    startOfDay.setHours(0, 0, 0, 0);
                    const endOfDay = new Date(searchDate);
                    endOfDay.setHours(23, 59, 59, 999);
                    searchConditions.push({
                        appointment: { scheduled_start: { gte: startOfDay, lte: endOfDay } }
                    });
                }
            }
            where.OR = searchConditions;
        }
        // --- SORTING LOGIC ---
        let orderBy: any = { created_at: "desc" };
        if (sort_by && sort_order) {
            const order = sort_order.toLowerCase() === 'asc' ? 'asc' : 'desc';
            if (sort_by === 'client_name') {
                orderBy = [
                    { client: { first_name: order } },
                    { client: { last_name: order } },
                    { client: { middle_name: order } }
                ];
            } else if (sort_by === 'session_date') {
                orderBy = { appointment: { scheduled_start: order } };
            } else if (sort_by === 'session_type') {
                orderBy = { is_first_appointment: order };
            }
        }
        // Statistics calculation
        const [aggErr, aggregateData] = await handle<any>(prisma.feedback.aggregate({
            where,
            _count: { _all: true },
            _avg: { rating: true }
        }));
        if (aggErr) return errorResponse(res, 500, "Failed to calculate statistics");
        const skip = (Number(page) - 1) * Number(itemsPerPage);
        const [err, items] = await handle<any[]>(prisma.feedback.findMany({
            where,
            orderBy: orderBy,
            skip: skip,
            take: Number(itemsPerPage),
            include: {
                coach: { select: { id: true, first_name: true, middle_name: true, last_name: true, email: true } },
                client: { select: { id: true, first_name: true, middle_name: true, last_name: true, email: true } },
                appointment: {
                    select: {
                        id: true,
                        scheduled_start: true,
                        scheduled_end: true,
                        status: true
                    }
                }
            }
        }));
        if (err) return errorResponse(res, 500, "Failed to fetch feedback records");
        // Formatting response to match your JSON structure
        const formattedItems = (items || []).map((item: any) => ({
            ...item,
            coach_name: [item.coach?.first_name, item.coach?.middle_name, item.coach?.last_name]
                .filter(Boolean).join(" "),
            client_name: [item.client?.first_name, item.client?.middle_name, item.client?.last_name]
                .filter(Boolean).join(" "),
            appointment_date: item.appointment?.scheduled_start ? item.appointment.scheduled_start.toISOString().split('T')[0] : null
        }));
        return successResponse(res, 200, "Get all feedback successfully", {
            totalCount: aggregateData?._count?._all || 0,
            overall_Rating: aggregateData?._avg?.rating?.toFixed(2) || "0.00",
            items: formattedItems
        });
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Get Feedback By Id
async function getFeedbackById(req: Request, res: Response) {
    logger.info({ component }, "Get Feedback By ID");
    try {
        const id = req.params.id;
        if (!id) {
            return errorResponse(res, 400, "ID is required");
        }
        const [err, feedback] = await handle(
            prisma.feedback.findUnique({
                where: { id },
                include: {
                    coach: {
                        select: {
                            id: true,
                            first_name: true,
                            middle_name: true,
                            last_name: true,
                            email: true,
                        },
                    },
                    client: {
                        select: {
                            id: true,
                            first_name: true,
                            middle_name: true,
                            last_name: true,
                            email: true,
                        },
                    },
                    appointment: {
                        select: {
                            id: true,
                            scheduled_start: true,
                            scheduled_end: true,
                            status: true
                        }
                    }
                }
            })
        );
        if (err) {
            return errorResponse(res, 500, "Failed to fetch feedback data");
        }
        if (!feedback) {
            return errorResponse(res, 404, "Feedback not found");
        }
        return successResponse(res, 200, "Get feedback by Id successfully", feedback);
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// Get Feedback By Coach Id
// async function getFeedbackByCoachId(req: Request, res: Response) {
//     logger.info({ component }, "Get Feedback By Coach ID");
//     try {
//         const coach_id = req.params.coach_id;
//         if (!coach_id) {
//             return errorResponse(res, 400, "Coach ID is required");
//         }
//         const [err, feedbacks] = await handle(
//             prisma.feedback.findMany({
//                 where: {
//                     coach_id,
//                     status: { not: 2 }  // Exclude deleted
//                 },
//                 orderBy: { created_at: "desc" },
//                 include: {
//                     client: {
//                         select: {
//                             id: true,
//                             first_name: true,
//                             email: true,
//                         },
//                     },
//                 },
//             })
//         );
//         if (err) {
//             return errorResponse(res, 500, "Failed to fetch feedback data");
//         }
//         if (!feedbacks || feedbacks.length === 0) {
//             return res.status(200).json({
//                 status: "false",
//                 statusCode: 200,
//                 data: [],
//                 message: "No feedback found for this coach",
//             });
//         }
//         // Calculate average rating
//         const totalRating = feedbacks.reduce((sum, f) => sum + f.rating, 0);
//         const averageRating = totalRating / feedbacks.length;
//         return successResponse(res, 200, "Get feedback by coach Id successfully", {
//             feedbacks,
//             totalFeedbacks: feedbacks.length,
//             averageRating: averageRating.toFixed(2),
//         });
//     } catch (error: any) {
//         logger.error({ component }, error.message);
//         return errorResponse(res, 500, error.message);
//     }
// }

// Get Feedback By Client Id
// async function getFeedbackByClientId(req: Request, res: Response) {
//     logger.info({ component }, "Get Feedback By Client ID");
//     try {
//         const client_id = req.params.client_id;
//         if (!client_id) {
//             return errorResponse(res, 400, "Client ID is required");
//         }
//         const [err, feedbacks] = await handle(
//             prisma.feedback.findMany({
//                 where: {
//                     client_id,
//                     status: { not: 2 }  // Exclude deleted
//                 },
//                 orderBy: { created_at: "desc" },
//                 include: {
//                     coach: {
//                         select: {
//                             id: true,
//                             first_name: true,
//                             email: true,
//                         },
//                     },
//                 },
//             })
//         );
//         if (err) {
//             return errorResponse(res, 500, "Failed to fetch feedback data");
//         }
//         if (!feedbacks || feedbacks.length === 0) {
//             return res.status(200).json({
//                 status: "false",
//                 statusCode: 200,
//                 data: [],
//                 message: "No feedback found for this client",
//             });
//         }
//         return successResponse(res, 200, "Get feedback by client Id successfully", {
//             feedbacks,
//             totalFeedbacks: feedbacks.length,
//         });
//     } catch (error: any) {
//         logger.error({ component }, error.message);
//         return errorResponse(res, 500, error.message);
//     }
// }

export default {
    createFeedback,
    getAllFeedback,
    getFeedbackById,
    // getFeedbackByCoachId,
    // getFeedbackByClientId
};
