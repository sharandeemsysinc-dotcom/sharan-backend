import { Request, Response } from "express";
import prisma from "../config/prisma";
import logger from "../utils/logger";
import { successResponse, errorResponse } from "../utils/responseHandler";

const component = "Holiday Controller";
const DELETED_STATUS = 1;
const ACTIVE_STATUS = 0;

// Handle Async Wrapper
async function handle<T>(promise: Promise<T>): Promise<[any, T | undefined]> {
    try {
        const data = await promise;
        return [null, data];
    } catch (error) {
        return [error, undefined];
    }
}

// Save Holiday
async function save_Holiday(req: Request, res: Response) {
    logger.info({ component }, "Save Holiday", req.body);
    const coach_user_Id = req.user.id;
    const { holidayDate, reason } = req.body;
    let [err, coach] = await handle(
        prisma.coach.findUnique({
            where: { user_id: coach_user_Id },
        })
    );
    if (err) {
        logger.error({ component, error: err }, "Database error fetching coach");
        return errorResponse(res, 500, "Failed to fetch coach data");
    }
    if (!coach) {
        logger.warn({ component, coach_user_Id }, "Coach not found for user ID");
        return errorResponse(res, 404, "Coach not found.");
    }
    const coachId = coach.id;
    if (!holidayDate || !reason) {
        return errorResponse(res, 400, "Missing required fields: holidayDate and reason are required.");
    }
    const dateObject = new Date(holidayDate);
    dateObject.setUTCHours(0, 0, 0, 0);
    if (isNaN(dateObject.getTime())) {
        return errorResponse(res, 400, "Invalid holidayDate format.");
    }
    if (typeof reason !== 'string' || reason.trim().length === 0) {
        return errorResponse(res, 400, "Reason must be a non-empty string.");
    }
    try {
        const existingHoliday = await prisma.holiday.findFirst({
            where: {
                coachId: coachId,
                holidayDate: dateObject,
                isDeleted: 0
            },
        });
        if (existingHoliday) {
            logger.warn({ component, coachId, holidayDate: dateObject }, "Attempt to create duplicate holiday date");
            return errorResponse(res, 409, "A holiday already exists for this coach on the specified date.");
        }
    } catch (dbCheckError) {
        logger.error({ component, error: dbCheckError }, "Database error during duplicate date check");
        return errorResponse(res, 500, "An error occurred while checking for existing holidays.");
    }
    try {
        const appointmentIds = await getAppointmentsOnHoliday(dateObject, coachId);
        if (appointmentIds.length > 0) {
            const updateResult = await prisma.appointment.updateMany({
                where: {
                    id: {
                        in: appointmentIds,
                    },
                },
                data: {
                    status: 3, // CANCELLED
                    cancelled_by: coach_user_Id,
                    cancel_reason: reason || "Coach Holiday/Absence",
                    cancelled_at: new Date()
                },
            });
            logger.info({ component, cancelledCount: updateResult.count }, "Cancelled appointments due to new holiday");
        }
        const newHolidayData = {
            coachId: coachId,
            holidayDate: dateObject,
            reason: reason,
            isDeleted: 0,
        };
        const newHoliday = await prisma.holiday.create({
            data: newHolidayData,
        });
        logger.info({ component, holidayId: newHoliday.id }, "Holiday successfully saved and appointments handled");
        return successResponse(res, 201, "Holiday saved successfully and conflicting appointments were cancelled.", newHoliday);
    } catch (prismaError: any) {
        logger.error({ component, error: prismaError }, "Failed to save holiday or cancel appointments");
        return errorResponse(res, 500, "Failed to save holiday or cancel conflicting appointments due to a database error.");
    }
}

// Update Holiday by Id
async function update_Holiday(req: Request, res: Response) {
    logger.info({ component }, "Update Holiday", req.body);
    const holidayId = req.params.id;
    const body = req.body;
    const coach_user_Id = req.user.id;
    if (!holidayId) {
        return errorResponse(res, 400, "Missing holiday ID in URL parameters.");
    }
    const updateData: { holidayDate?: Date; reason?: string } = {};
    let newHolidayDate: Date | undefined;
    if (body.holidayDate) {
        const dateObject = new Date(body.holidayDate);
        dateObject.setUTCHours(0, 0, 0, 0);
        if (isNaN(dateObject.getTime())) {
            return errorResponse(res, 400, "Invalid holidayDate format.");
        }
        updateData.holidayDate = dateObject;
        newHolidayDate = dateObject;
    }
    if (body.reason !== undefined) {
        if (typeof body.reason !== 'string' || body.reason.trim().length === 0) {
            return errorResponse(res, 400, "Reason must be a non-empty string.");
        }
        updateData.reason = body.reason;
    }
    if (Object.keys(updateData).length === 0) {
        return errorResponse(res, 400, "No valid update fields provided.");
    }
    let [coachErr, coach] = await handle(
        prisma.coach.findUnique({ where: { user_id: coach_user_Id } })
    );
    if (coachErr || !coach) {
        return errorResponse(res, 403, "Authorization failed: Coach record not found.");
    }
    const coachId = coach.id;
    if (newHolidayDate) {
        try {
            const existingHoliday = await prisma.holiday.findFirst({
                where: {
                    coachId: coachId,
                    holidayDate: newHolidayDate,
                    NOT: {
                        id: holidayId,
                    },
                },
            });
            if (existingHoliday) {
                logger.warn({ component, holidayId, newHolidayDate }, "Attempt to set duplicate holiday date");
                return errorResponse(res, 409, "A holiday already exists for this coach on the specified date.");
            }
        } catch (dbCheckError) {
            logger.error({ component, error: dbCheckError }, "Database error during duplicate date check");
            return errorResponse(res, 500, "An error occurred while checking for duplicate dates.");
        }
    }
    try {
        if (newHolidayDate) {
            const appointmentIds = await getAppointmentsOnHoliday(newHolidayDate, coachId);
            if (appointmentIds.length > 0) {
                const updateResult = await prisma.appointment.updateMany({
                    where: {
                        id: {
                            in: appointmentIds,
                        },
                    },
                    data: {
                        status: 3, // CANCELLED
                        cancelled_by: coach_user_Id,
                        cancel_reason: body.reason || "Coach Holiday/Update",
                        cancelled_at: new Date()
                    },
                });
                logger.info({ component, cancelledCount: updateResult.count }, "Cancelled appointments due to holiday update");
            }
        }
        const updatedHoliday = await prisma.holiday.update({
            where: {
                id: holidayId,
                coachId: coachId,
            },
            data: updateData,
        });
        logger.info({ component, holidayId: updatedHoliday.id }, "Holiday successfully updated");
        return successResponse(res, 200, "Holiday updated successfully.", updatedHoliday);
    } catch (prismaError: any) {
        if (prismaError.code === 'P2025') {
            logger.warn({ component, holidayId, coachId }, "Holiday record not found or unauthorized");
            return errorResponse(res, 404, "Holiday not found or you are not authorized to update it.");
        }
        logger.error({ component, error: prismaError }, "Failed to update holiday record");
        return errorResponse(res, 500, "Failed to update holiday due to a database error.");
    }
}

// Soft Delete Holiday by Id
async function soft_Delete_Holiday(req: Request, res: Response) {
    logger.info({ component }, "Soft Delete Holiday", req.params);
    const holidayId = req.params.id;
    const coach_user_Id = req.user.id;
    if (!holidayId) {
        return errorResponse(res, 400, "Missing holiday ID in URL parameters.");
    }
    let [coachErr, coach] = await handle(
        prisma.coach.findUnique({ where: { user_id: coach_user_Id } })
    );
    if (coachErr || !coach) {
        logger.warn({ component, coach_user_Id }, "Coach record not found for user ID during soft delete attempt.");
        return errorResponse(res, 403, "Authorization failed: Coach record not found.");
    }
    const coachId = coach.id;
    try {
        const deletedHoliday = await prisma.holiday.update({
            where: {
                id: holidayId,
                coachId: coachId,
            },
            data: {
                isDeleted: DELETED_STATUS,
            },
        });
        logger.info({ component, holidayId: deletedHoliday.id }, "Holiday successfully soft deleted");
        return successResponse(res, 200, "Holiday soft deleted successfully.", deletedHoliday);
    } catch (prismaError: any) {
        if (prismaError.code === 'P2025') {
            logger.warn({ component, holidayId, coachId }, "Holiday record not found or unauthorized for soft delete");
            return errorResponse(res, 404, "Holiday not found or you are not authorized to delete it.");
        }
        logger.error({ component, error: prismaError }, "Failed to soft delete holiday record");
        return errorResponse(res, 500, "Failed to soft delete holiday due to a database error.");
    }
}

// Get Holiday by Id
async function get_Holdiday_by_Id(req: Request, res: Response) {
    logger.info({ component }, "Get Holiday by ID", req.params);
    const holidayId = req.params.id;
    const coach_user_Id = req.user.id;
    if (!holidayId) {
        return errorResponse(res, 400, "Missing holiday ID in URL parameters.");
    }
    let [coachErr, coach] = await handle(
        prisma.coach.findUnique({ where: { user_id: coach_user_Id } })
    );
    if (coachErr || !coach) {
        logger.warn({ component, coach_user_Id }, "Coach record not found for user ID during fetch attempt.");
        return errorResponse(res, 403, "Authorization failed: Coach record not found.");
    }
    const coachId = coach.id;
    try {
        const holiday = await prisma.holiday.findUnique({
            where: {
                id: holidayId,
                coachId: coachId,
                isDeleted: 0
            },
        });
        if (!holiday) {
            logger.warn({ component, holidayId, coachId }, "Holiday record not found for user or ID is incorrect.");
            return errorResponse(res, 404, "Holiday not found");
        }
        logger.info({ component, holidayId: holiday.id }, "Holiday successfully fetched");
        return successResponse(res, 200, "Holiday fetched successfully.", holiday);
    } catch (prismaError: any) {
        logger.error({ component, error: prismaError }, "Failed to fetch holiday record");
        return errorResponse(res, 500, "Failed to fetch holiday due to a database error.");
    }
}

// Get all Holidays by CoachId
async function get_All_Holidays_by_CoachId(req: Request, res: Response) {
    const component = "GetAllHolidaysByCoachId";
    logger.info({ component }, "Fetching All Holidays for Coach", req.body);
    const page = Number(req.body.page ?? 0);
    const itemPerPage = Number(req.body.itemPerPage ?? 0);
    const noPagination = !page || !itemPerPage;
    const coach_user_Id = req.user.id;
    let [coachErr, coach] = await handle(
        prisma.coach.findUnique({ where: { user_id: coach_user_Id } })
    );
    if (coachErr) {
        logger.error({ component, coachErr }, "Failed to fetch coach data");
        return errorResponse(res, 500, "Failed to fetch coach data");
    }
    if (!coach) {
        logger.warn({ component, coach_user_Id }, "Coach record not found for user ID.");
        return errorResponse(res, 403, "Authorization failed: Coach record not found.");
    }
    const coachId = coach.id;
    const where: any = {};
    where.coachId = coachId;
    where.isDeleted = ACTIVE_STATUS;
    let [countErr, totalCount] = await handle(
        prisma.holiday.count({ where })
    );
    if (countErr) {
        logger.error({ component, countErr }, "Failed to count holiday records");
        return errorResponse(res, 500, "Failed to count holiday records");
    }
    const query: any = {
        where,
        orderBy: { holidayDate: 'asc' },
    };
    if (!noPagination) {
        const skip = (page - 1) * itemPerPage;
        query.skip = skip;
        query.take = itemPerPage;
    }
    try {
        let [fetchErr, holidays] = await handle(
            prisma.holiday.findMany(query)
        );
        if (fetchErr) {
            logger.error({ component, fetchErr }, "Database error while fetching Holidays");
            return errorResponse(res, 500, "Failed to fetch holidays due to a server error.");
        }
        if (!holidays || holidays.length === 0) {
            return res.status(200).json({
                status: true,
                statusCode: 200,
                data: [],
                message: "No Holidays found for this Coach"
            });
        }
        logger.info({ component, count: holidays.length }, "Holidays fetched successfully");
        return successResponse(
            res,
            200,
            "Holidays fetched successfully",
            { totalCount, items: holidays }
        );
    } catch (unexpectedError: any) {
        logger.error({ component, unexpectedError }, "Unexpected error in Get All Holidays function");
        return errorResponse(res, 500, unexpectedError.message);
    }
}

// check_aapointments_for_Holiday
async function check_aapointments_for_Holiday(req: Request, res: Response) {
    const component = "check_aapointments_for_Holiday_payload";
    logger.info({ component }, "Checking appointments for Holiday based on payload.", req.body);
    const { holidayDate: dateString } = req.body;
    const coachUserId = req.user.id;
    if (!dateString) {
        return errorResponse(res, 400, "Missing 'holidayDate' in the request body.");
    }
    const holidayDate = new Date(dateString);
    if (isNaN(holidayDate.getTime())) {
        return errorResponse(res, 400, `Invalid date format provided for 'holidayDate': ${dateString}`);
    }
    let [coachErr, coach] = await handle(
        prisma.coach.findUnique({ where: { user_id: coachUserId } })
    );
    if (coachErr || !coach) {
        logger.warn({ component, coachUserId }, "Coach record not found for user ID during check attempt.");
        return errorResponse(res, 403, "Authorization failed: Coach record not found.");
    }
    const coachId = coach.id;
    const startOfDay = new Date(holidayDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(holidayDate);
    endOfDay.setHours(23, 59, 59, 999);
    let [appointmentsErr, appointments] = await handle(
        prisma.appointment.findMany({
            where: {
                coach_id: coachId,
                scheduled_start: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
            select: { id: true, scheduled_start: true },
            take: 1,
        })
    );
    const [year, month, day] = dateString.split("-");
    const formattedDate = `${day}-${month}-${year}`;
    if (appointmentsErr) {
        logger.error({ component, coachId, error: appointmentsErr }, "Database error checking appointments.");
        return errorResponse(res, 500, "An internal server error occurred while checking appointments.");
    }
    if (appointments && appointments.length > 0) {
        const appointmentTime = appointments[0]?.scheduled_start;
        logger.warn({ component, coachId, appointmentTime }, "Appointments found on this date. Blocking operation.");
        let message = `An appointment found on this date ${formattedDate}.`;
        if (appointmentTime) {
            message = `An appointment is found on ${formattedDate}.`;
        }
        return errorResponse(
            res,
            409,
            message
        );
    }
    logger.info({ component, coachId }, `No active appointments found on ${formattedDate}. Proceeding.`);
    return res.status(200).json({
        message: "No conflicting appointments found. Proceed with the holiday action.",
        can_proceed: true,
        date_checked: formattedDate
    });
}

// Service Function - Has Appointment
async function getAppointmentsOnHoliday(holidayDate: Date, coachId: string): Promise<string[]> {
    const appointmentIds: string[] = [];
    const startOfDay = new Date(holidayDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(holidayDate);
    endOfDay.setHours(23, 59, 59, 999);
    let [appointmentsErr, appointments] = await handle(
        prisma.appointment.findMany({
            where: {
                coach_id: coachId,
                scheduled_start: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
            select: { id: true },
        })
    );
    if (appointmentsErr || !appointments) {
        throw new Error("Failed to check for appointments due to a database error.");
    }
    if (appointments.length == 0) {
        return appointmentIds;
    }
    const foundIds = appointments.map(appointment => appointment.id);
    return foundIds;
}

export default {
    save_Holiday,
    update_Holiday,
    soft_Delete_Holiday,
    get_Holdiday_by_Id,
    get_All_Holidays_by_CoachId,
    check_aapointments_for_Holiday
};