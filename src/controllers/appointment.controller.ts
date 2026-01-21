import { Request, Response } from "express";
import prisma from "../config/prisma";
import { AppointmentModel, AppointmentStatusEnum } from "../models/appointment";
import logger from "../utils/logger";
import { successResponse, errorResponse } from "../utils/responseHandler";
import { createMeeting, addParticipant } from "../services/dyte.service";
import { sendAppointmentConfirmation, sendAppointmentRejection } from "../services/email.service";
import { generateGoogleCalendarLink } from "../services/calendar.service";
import { v4 as uuidv4 } from 'uuid';

const component = "Appointment Controller";

// CREATE APPOINTMENT
async function createAppointment_Single(req: Request, res: Response) {
    logger.info({ component }, "Create Appointment API Called", req.body);
    try {
        const {
            coach_id,
            client_id,
            scheduled_start,
            scheduled_end,
            duration_minutes,
            timezone,
            price,
            currency,
            coach_notes,
            client_notes,
            is_overlapped
        } = req.body;
        // --- Validation ---
        if (!coach_id || !client_id || !scheduled_start || !scheduled_end || !duration_minutes || !timezone) {
            return errorResponse(res, 400, "Missing required fields");
        }
        const [coach, client] = await Promise.all([
            prisma.coach.findUnique({ where: { id: coach_id } }),
            prisma.client.findUnique({ where: { id: client_id } })
        ]);
        if (!coach || !client) {
            return errorResponse(res, 404, "Coach or Client not found");
        }
        // ---------- CLIENT HISTORY COMPLETION CHECK ----------
        const clientHistory = await (prisma as any).clientHistory.findUnique({
            where: { client_id: client_id }
        });
        if (!clientHistory) {
            return errorResponse(res, 400, "Client profile history is missing. Please complete your profile first.");
        }
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
            const value = (clientHistory as any)[field];
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
        if (missingFields.length > 0) {
            return errorResponse(
                res,
                400,
                `Please complete your profile. The following fields are required: ${missingFields.join(', ')}`
            );
        }
        const start = new Date(scheduled_start);
        const end = new Date(scheduled_end);
        // ---------- HOLIDAY CHECK ----------
        const startOfDay = new Date(start);
        startOfDay.setHours(0, 0, 0, 0);
        const holiday = await (prisma as any).holiday.findFirst({
            where: {
                coachId: coach_id,
                holidayDate: startOfDay
            }
        });
        if (holiday) {
            return errorResponse(res, 400, "Coach is on holiday on selected date");
        }
        // ---------- WORKING HOURS CHECK ----------
        const workingHours = await (prisma as any).workingHours.findFirst({
            where: { coachId: coach_id, isDeleted: 0 }
        });
        if (!workingHours || !workingHours.workingHours_of_Coach) {
            return errorResponse(res, 400, "Coach has no working hours defined");
        }
        // 1. Use getUTCDay() to match the UTC date
        const dayIndex = Number(start.getUTCDay());
        const daySchedule = workingHours.workingHours_of_Coach.find(
            (d: any) => d.day === dayIndex
        );
        if (!daySchedule || !daySchedule.sessions?.length) {
            return errorResponse(res, 400, "Coach is not working on this day");
        }
        // 2. Use UTC hours/minutes to compare against the session strings
        const getMinutes = (h: number, m: number) => h * 60 + m;
        const reqStartMin = start.getUTCHours() * 60 + start.getUTCMinutes();
        const reqEndMin = end.getUTCHours() * 60 + end.getUTCMinutes();
        const withinSession = daySchedule.sessions.some((s: any) => {
            const [sh, sm] = s.startTime.split(":").map(Number);
            const [eh, em] = s.endTime.split(":").map(Number);
            const sessionStartMin = getMinutes(sh, sm);
            const sessionEndMin = getMinutes(eh, em);
            return reqStartMin >= sessionStartMin && reqEndMin <= sessionEndMin;
        });
        if (!withinSession) {
            return errorResponse(res, 400, "Selected time is outside coach working hours");
        }
        // ---------- OVERLAP CHECK ----------
        if (!is_overlapped) {
            const overlap = await prisma.appointment.findFirst({
                where: {
                    coach_id,
                    client_id,
                    status: { not: AppointmentStatusEnum.CANCELLED },
                    scheduled_start: { lt: end },
                    scheduled_end: { gt: start }
                }
            });
            if (overlap) {
                return errorResponse(res, 400, "Time slot overlaps with another appointment");
            }
        }
        // ---------------- DYTE MEETING ----------------
        const meetingTitle = `Session with ${coach.first_name} and ${client.first_name}`;
        const dyteMeeting = await createMeeting(meetingTitle);
        const roomName = dyteMeeting.name || `room-${dyteMeeting.id}`;

        const participant = await addParticipant(
            dyteMeeting.id,
            `${client.first_name} ${client.last_name}`,
            "participant",
            client.id
        );
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        const meetingLink = `${frontendUrl}/room/${roomName}?authToken=${participant.token}`;
        // Check if first meeting overall
        const existingAppointment = await prisma.appointment.findFirst({
            where: { coach_id, client_id },
            select: { id: true }
        });
        // ---------- CREATE APPOINTMENT ----------
        const appointment = await prisma.appointment.create({
            data: {
                coach: { connect: { id: coach_id } },
                client: { connect: { id: client_id } },
                start_date: start,
                end_date: end,
                scheduled_start: start,
                scheduled_end: end,
                duration_minutes,
                timezone,
                status: AppointmentStatusEnum.PENDING,
                is_reschedule: 0,
                is_overlapped: is_overlapped,
                is_first_meeting: !existingAppointment,
                meeting_type: "single",
                meeting_provider: "dyte",
                meeting_link: meetingLink,
                dyte_meeting_id: dyteMeeting.id,
                dyte_room_name: roomName,
                ...(price && { price }),
                ...(currency && { currency }),
                ...(coach_notes && { coach_notes }),
                ...(client_notes && { client_notes })
            }
        });
        // ---------- CALENDAR & EMAIL ----------
        const calLink = generateGoogleCalendarLink(
            `Session with ${coach.first_name} & ${client.first_name}`,
            `Coaching session via Dyte.\nMeeting link: ${meetingLink}`,
            "Online / Dyte",
            start,
            end
        );
        await sendAppointmentConfirmation({
            to: client.email!,
            subject: "Appointment Requested (Pending Approval)",
            clientName: `${client.first_name} ${client.last_name}`,
            coachName: `${coach.first_name} ${coach.last_name}`,
            date: start.toLocaleDateString(),
            time: start.toLocaleTimeString(),
            meetingLink,
            calendarLink: calLink,
            platform: "Dyte"
        });
        return successResponse(res, 200, "Appointment created successfully (Pending Approval)", appointment);
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// CREATE MULTIPLE APPOINTMENTS (SERIES)
async function createAppointment_Multiple(req: Request, res: Response) {
    logger.info({ component }, "Create Appointment Series Called", req.body);
    try {
        const {
            coach_id, client_id, scheduled_start, scheduled_end, duration_minutes,
            timezone, meeting_type, repeat_unit, repeat_interval, recurrence_days,
            recurrence_start_date, recurrence_pattern_type,
            fixed_day_of_month, relative_week_index, relative_day_of_week,
            price, currency, coach_notes, client_notes, is_overlapped, no_of_sessions
        } = req.body;
        // ---------- GENERATE UNIQUE SERIES ID ----------
        // We generate this once here so all appointments in this loop share it.
        const series_id = meeting_type === "recurring" ? uuidv4() : null;
        // 1. Basic Validation
        if (!coach_id || !client_id || !scheduled_start || !scheduled_end || !recurrence_start_date || !no_of_sessions) {
            return errorResponse(res, 400, "Missing required fields for series");
        }
        const [coach, client] = await Promise.all([
            prisma.coach.findUnique({ where: { id: coach_id } }),
            prisma.client.findUnique({ where: { id: client_id } })
        ]);
        if (!coach || !client) return errorResponse(res, 404, "Coach or Client not found");
        // ---------- CLIENT HISTORY COMPLETION CHECK ----------
        const clientHistory = await (prisma as any).clientHistory.findUnique({
            where: { client_id: client_id }
        });
        if (!clientHistory) {
            return errorResponse(res, 400, "Client profile history is missing. Please complete your profile first.");
        }
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
            const value = (clientHistory as any)[field];
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
        if (missingFields.length > 0) {
            return errorResponse(
                res,
                400,
                `Please complete your profile. The following fields are required: ${missingFields.join(', ')}`
            );
        }
        // 2. GENERATE ALL DATES IN THE SERIES
        const appointmentDates: Date[] = [];
        const seriesStart = new Date(recurrence_start_date);
        // const seriesEnd = new Date(recurrence_end_date);
        const interval = parseInt(repeat_interval) || 1;
        const totalSessionsNeeded = parseInt(no_of_sessions);
        let current = new Date(seriesStart);
        if (meeting_type === "single") {
            appointmentDates.push(new Date(scheduled_start));
        } else {
            // RECURRENCE LOGIC: Loop until we have enough sessions
            while (appointmentDates.length < totalSessionsNeeded) {

                if (repeat_unit === 1) { // Daily
                    appointmentDates.push(new Date(current));
                    current.setDate(current.getDate() + interval);
                }
                else if (repeat_unit === 2 || repeat_unit === 3) { // Weekly or Bi-Weekly
                    const jumpMultiplier = repeat_unit === 3 ? 2 : 1;
                    const daysToMatch = recurrence_days.map(Number);

                    // Check each day of the current week
                    for (let i = 0; i < 7; i++) {
                        const checkDate = new Date(current);
                        checkDate.setDate(current.getDate() + i);

                        if (daysToMatch.includes(checkDate.getUTCDay()) && checkDate >= seriesStart) {
                            if (appointmentDates.length < totalSessionsNeeded) {
                                appointmentDates.push(new Date(checkDate));
                            }
                        }
                    }
                    // Move to the next week interval
                    current.setDate(current.getDate() + (7 * jumpMultiplier * interval));
                }
                else if (repeat_unit === 4) { // Monthly
                    let targetDate: Date;
                    if (recurrence_pattern_type === "fixed") {
                        const requestedDay = parseInt(fixed_day_of_month);
                        const lastDayInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
                        const actualDay = Math.min(requestedDay, lastDayInMonth);
                        targetDate = new Date(current.getFullYear(), current.getMonth(), actualDay);
                    } else {
                        targetDate = getRelativeDate(
                            current.getFullYear(), current.getMonth(),
                            parseInt(relative_week_index), parseInt(relative_day_of_week)
                        );
                    }
                    targetDate.setHours(seriesStart.getHours(), seriesStart.getMinutes(), 0, 0);
                    if (targetDate >= seriesStart) {
                        appointmentDates.push(new Date(targetDate));
                    }
                    current.setMonth(current.getMonth() + interval);
                }
                else if (repeat_unit === 5) { // Yearly
                    let targetDate: Date;
                    if (recurrence_pattern_type === "fixed") {
                        targetDate = new Date(current.getFullYear(), seriesStart.getMonth(), parseInt(fixed_day_of_month) || seriesStart.getDate());
                    } else {
                        targetDate = getRelativeDate(
                            current.getFullYear(), seriesStart.getMonth(),
                            parseInt(relative_week_index), parseInt(relative_day_of_week)
                        );
                    }
                    if (targetDate >= seriesStart) {
                        appointmentDates.push(targetDate);
                    }
                    current.setFullYear(current.getFullYear() + interval);
                }
            }
        }
        // CALCULATE FINAL RECURRENCE END DATE
        // We take the last appointment date generated as the recurrence_end_date
        const calculatedRecurrenceEndDate = appointmentDates.length > 0
            ? appointmentDates[appointmentDates.length - 1]
            : seriesStart;
        // 3. PRE-VALIDATION LOOP (Holidays, Working Hours, Overlaps)
        const baseStart = new Date(scheduled_start);
        const baseEnd = new Date(scheduled_end);
        const validatedSlots: { start: Date; end: Date }[] = [];
        for (const date of appointmentDates) {
            const start = new Date(date);
            start.setHours(baseStart.getHours(), baseStart.getMinutes(), 0);
            const end = new Date(date);
            end.setHours(baseEnd.getHours(), baseEnd.getMinutes(), 0);
            // --- Holiday Check ---
            const startOfDay = new Date(start); startOfDay.setHours(0, 0, 0, 0);
            const holiday = await (prisma as any).holiday.findFirst({ where: { coachId: coach_id, holidayDate: startOfDay } });
            if (holiday) return errorResponse(res, 400, `Coach is on holiday on ${start.toDateString()}`);
            // ---------- WORKING HOURS CHECK ----------
            const workingHours = await (prisma as any).workingHours.findFirst({
                where: { coachId: coach_id, isDeleted: 0 }
            });
            if (!workingHours || !workingHours.workingHours_of_Coach) {
                return errorResponse(res, 400, "Coach has no working hours defined");
            }
            // 1. Use getUTCDay() to match the UTC date
            const dayIndex = Number(start.getUTCDay());
            const daySchedule = workingHours.workingHours_of_Coach.find(
                (d: any) => d.day === dayIndex
            );
            if (!daySchedule || !daySchedule.sessions?.length) {
                return errorResponse(res, 400, "Coach is not working on this day");
            }
            // 2. Use UTC hours/minutes to compare against the session strings
            const getMinutes = (h: number, m: number) => h * 60 + m;
            const reqStartMin = start.getUTCHours() * 60 + start.getUTCMinutes();
            const reqEndMin = end.getUTCHours() * 60 + end.getUTCMinutes();
            const withinSession = daySchedule.sessions.some((s: any) => {
                const [sh, sm] = s.startTime.split(":").map(Number);
                const [eh, em] = s.endTime.split(":").map(Number);
                const sessionStartMin = getMinutes(sh, sm);
                const sessionEndMin = getMinutes(eh, em);
                return reqStartMin >= sessionStartMin && reqEndMin <= sessionEndMin;
            });
            if (!withinSession) {
                return errorResponse(res, 400, "Selected time is outside coach working hours");
            }
            // --- Overlap Check (Only if is_overlapped is false) ---
            if (!is_overlapped) {
                const overlap = await prisma.appointment.findFirst({
                    where: { coach_id, client_id, status: { not: AppointmentStatusEnum.CANCELLED }, scheduled_start: { lt: end }, scheduled_end: { gt: start } }
                });
                if (overlap) return errorResponse(res, 400, `Time slot overlaps on ${start.toDateString()}`);
            }
            validatedSlots.push({ start, end });
        }
        // 4. CREATION LOOP
        const createdAppointments = [];
        const existingAppointment = await prisma.appointment.findFirst({ where: { coach_id, client_id }, select: { id: true } });
        let isFirst = !existingAppointment;
        for (const slot of validatedSlots) {
            // Dyte Meeting
            const dyteMeeting = await createMeeting(`Session with ${coach.first_name}`);
            const participant = await addParticipant(dyteMeeting.id, `${client.first_name} ${client.last_name}`, "participant", client.id);
            const meetingLink = `${process.env.FRONTEND_URL}/room/${dyteMeeting.name || dyteMeeting.id}?authToken=${participant.token}`;
            const appointment = await prisma.appointment.create({
                data: {
                    coach_id, client_id, start_date: slot.start, end_date: slot.end, series_id,
                    scheduled_start: slot.start, scheduled_end: slot.end,
                    duration_minutes, timezone, status: AppointmentStatusEnum.PENDING,
                    is_first_meeting: isFirst, meeting_type, meeting_provider: "dyte",
                    meeting_link: meetingLink, dyte_meeting_id: dyteMeeting.id,
                    price, currency, coach_notes, client_notes, is_overlapped, repeat_unit, repeat_interval, recurrence_days,
                    recurrence_pattern_type,
                    fixed_day_of_month, relative_week_index, relative_day_of_week,
                    no_of_sessions: totalSessionsNeeded,
                    recurrence_end_date: calculatedRecurrenceEndDate,
                    ...(recurrence_start_date && {
                        recurrence_start_date: new Date(recurrence_start_date)
                    })
                }
            });
            isFirst = false; // Only the first one in the loop (if client is new) gets true
            // Calendar & Email
            const calLink = generateGoogleCalendarLink(`Coach Session`, `Link: ${meetingLink}`, "Online", slot.start, slot.end);
            await sendAppointmentConfirmation({
                to: client.email!, subject: "Session Scheduled",
                clientName: `${client.first_name}`, coachName: `${coach.first_name}`,
                date: slot.start.toLocaleDateString(), time: slot.start.toLocaleTimeString(),
                meetingLink, calendarLink: calLink, platform: "Dyte"
            });
            createdAppointments.push(appointment);
        }
        return successResponse(res, 200, "Series created successfully", {
            appointments: createdAppointments,
            count: createdAppointments.length
        });
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

/*** Helper to find the Nth occurrence of a Day of Week in a Month ***/
function getRelativeDate(year: number, month: number, weekIndex: number, dayOfWeek: number): Date {
    // 0: 1st, 1: 2nd, 2: 3rd, 3: 4th, 4: 5th/Last
    if (weekIndex < 4) {
        // Standard 1st through 4th week logic
        let date = new Date(year, month, 1);
        while (date.getDay() !== dayOfWeek) {
            date.setDate(date.getDate() + 1);
        }
        date.setDate(date.getDate() + (weekIndex * 7));
        return date;
    } else {
        // "Last [Day] of the Month" logic
        // Start from the last day of the month and work backwards
        let date = new Date(year, month + 1, 0);
        while (date.getDay() !== dayOfWeek) {
            date.setDate(date.getDate() - 1);
        }
        return date;
    }
}

// GET ALL APPOINTMENTS
async function getAllAppointments(req: Request, res: Response) {
    logger.info({ component }, "Get All Appointments");
    try {
        const page = Number(req.body.page ?? 1);
        const itemPerPage = Number(req.body.itemPerPage ?? 10);
        let { coach_id, client_id, start_date, end_date, appointment_filter, status, sort_by, sort_order, search } = req.body;
        const user = (req as any).user;
        const role = user?.role || user?.role_name; // Adjust based on JWT payload structure
        // Auto-filter based on Role
        if (role === 'Coach') {
            const coachProfile = await prisma.coach.findUnique({ where: { user_id: user.id } });
            if (!coachProfile) return successResponse(res, 200, "Coach profile not found", { totalCount: 0, items: [] });
            coach_id = coachProfile.id;
        } else if (role === 'Client') {
            const clientProfile = await prisma.client.findUnique({ where: { user_id: user.id } });
            if (!clientProfile) return successResponse(res, 200, "Client profile not found", { totalCount: 0, items: [] });
            client_id = clientProfile.id;
        }
        // If Admin or Staff, coach_id and client_id from body are used (if provided)
        const where: any = {};
        if (coach_id) where.coach_id = String(coach_id);
        if (client_id) where.client_id = String(client_id);
        if (start_date) where.start_date = { gte: new Date(String(start_date)) };
        if (end_date) where.end_date = { lte: new Date(String(end_date)) };
        if (status) where.status = Number(status);
        // Search Logic (Client Name & Date)
        if (search) {
            const searchStr = String(search).trim();
            const searchConditions: any[] = [
                // Client Name Search
                { client: { first_name: { contains: searchStr, mode: 'insensitive' } } },
                { client: { middle_name: { contains: searchStr, mode: 'insensitive' } } },
                { client: { last_name: { contains: searchStr, mode: 'insensitive' } } },
                // Coach Name Search
                { coach: { first_name: { contains: searchStr, mode: 'insensitive' } } },
                { coach: { middle_name: { contains: searchStr, mode: 'insensitive' } } },
                { coach: { last_name: { contains: searchStr, mode: 'insensitive' } } }
            ];
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
                    scheduled_start: {
                        gte: startOfYear,
                        lte: endOfYear
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
                            scheduled_start: {
                                gte: startOfPeriod,
                                lte: endOfPeriod
                            }
                        });
                    } else {
                        const month = parseInt(monthPart) - 1; // JS months are 0-indexed (0-11)
                        const startOfMonth = new Date(year, month, 1);
                        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
                        searchConditions.push({
                            scheduled_start: {
                                gte: startOfMonth,
                                lte: endOfMonth
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
                            scheduled_start: {
                                gte: startOfRange,
                                lte: endOfRange
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
                    searchConditions.push(
                        { scheduled_start: { gte: startOfDay, lte: endOfDay } }
                    );
                }
            }
            where.OR = searchConditions;
        }
        // Filter by appointment time (upcoming, past, or all)
        const now = new Date();
        if (appointment_filter === 1) {
            where.scheduled_start = { gte: now };
        } else if (appointment_filter === 2) {
            where.scheduled_start = { lt: now };
        }
        // If appointment_filter is 'all' or not provided, no additional filter is applied
        // Sorting Logic
        let orderBy: any = { scheduled_start: 'desc' }; // Default
        if (sort_by) {
            let orderDirection: 'asc' | 'desc' = 'asc';
            if (sort_order === 'z-a' || sort_order === 'desc') {
                orderDirection = 'desc';
            }
            if (sort_by === 'client_name') {
                // Sorts by First -> Last -> Middle
                orderBy = [
                    { client: { first_name: orderDirection } },
                    { client: { last_name: orderDirection } },
                    { client: { middle_name: orderDirection } }
                ];
            } else if (sort_by === 'coach_name') {
                orderBy = [
                    { coach: { first_name: orderDirection } },
                    { coach: { last_name: orderDirection } },
                    { coach: { middle_name: orderDirection } }
                ];
            } else if (sort_by === 'date' || sort_by === 'start_time') {
                orderBy = { scheduled_start: orderDirection };
            } else if (sort_by === 'end_time') {
                orderBy = { scheduled_end: orderDirection };
            } else if (sort_by === 'status') {
                orderBy = { status: orderDirection };
            }
        }
        const totalCount = await prisma.appointment.count({ where });
        const appointments = await prisma.appointment.findMany({
            where,
            skip: (page - 1) * itemPerPage,
            take: itemPerPage,
            orderBy: orderBy,
            include: {
                coach: { select: { id: true, first_name: true, middle_name: true, last_name: true, email: true } },
                client: { select: { id: true, first_name: true, middle_name: true, last_name: true, email: true } }
            }
        });
        return successResponse(res, 200, "Appointments fetched successfullyyy", {
            totalCount,
            totalPages: Math.ceil(totalCount / itemPerPage),
            currentPage: page,
            items: appointments.map(a => new AppointmentModel(a))
        });
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// GET APPOINTMENT BY ID
async function getAppointmentById(req: Request, res: Response) {
    logger.info({ component }, "Get Appointment By ID and Next Day Slots");
    try {
        const id = req.params.id;
        if (!id) return errorResponse(res, 400, "ID is required");
        // 1. Fetch current appointment
        const appointment = await prisma.appointment.findUnique({
            where: { id },
            include: { coach: true, client: true }
        });
        if (!appointment) return errorResponse(res, 404, "Appointment not found");
        // 2. Setup "Next Day" variables
        const coach_id = appointment.coach_id;
        const client_id = appointment.client_id;
        const currentStartDate = new Date(appointment.scheduled_start);
        // Calculate Next Day
        const nextDayDate = new Date(currentStartDate);
        nextDayDate.setUTCDate(nextDayDate.getUTCDate() + 1);
        const dateString = nextDayDate.toISOString().split('T')[0];
        // 3. Slot Logic
        // --- Duration Check (First Meeting Logic) ---
        let overrideDuration: number | null = null;
        if (!appointment) {
            const settings = await (prisma as any).settings.findFirst();
            if (settings?.first_meeting_duration) {
                overrideDuration = Number(settings.first_meeting_duration);
            }
        }
        // --- Fetch Working Hours ---
        const workingHoursRecord = await (prisma as any).workingHours.findFirst({
            where: { coachId: coach_id, isDeleted: 0 }
        });
        if (!workingHoursRecord || !workingHoursRecord.workingHours_of_Coach) {
            return successResponse(res, 200, "Appointment found, but no working hours for coach", {
                appointment: new AppointmentModel(appointment),
                nextDaySlots: { date: dateString, availableSlots: [], bookedSlots: [], message: "No working hours found" }
            });
        }
        // --- Match Day of Week ---
        const dayIndex = nextDayDate.getUTCDay();
        const workingHoursList = workingHoursRecord.workingHours_of_Coach as any[];
        const daySchedule = workingHoursList.find((wh: any) => Number(wh.day) === dayIndex);
        const availableSlots: any[] = [];
        const bookedSlots: any[] = [];
        if (daySchedule && daySchedule.sessions?.length) {
            // --- Fetch Booked Appointments for Next Day ---
            const startOfDay = new Date(nextDayDate);
            startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(nextDayDate);
            endOfDay.setUTCHours(23, 59, 59, 999);
            const bookedAppointments = await prisma.appointment.findMany({
                where: {
                    coach_id,
                    scheduled_start: { gte: startOfDay, lte: endOfDay },
                    status: { not: AppointmentStatusEnum.CANCELLED }
                },
                select: { scheduled_start: true, scheduled_end: true }
            });
            // --- Generate Slots ---
            const now = new Date();
            daySchedule.sessions.forEach((session: any) => {
                const { startTime, endTime, durationPerSlot } = session;
                const activeDuration = overrideDuration || Number(durationPerSlot);
                const [startH, startM] = startTime.split(':').map(Number);
                const [endH, endM] = endTime.split(':').map(Number);
                let slotStart = new Date(startOfDay);
                slotStart.setUTCHours(startH, startM, 0, 0);
                let sessionEnd = new Date(startOfDay);
                sessionEnd.setUTCHours(endH, endM, 0, 0);
                while (slotStart < sessionEnd) {
                    const slotEnd = new Date(slotStart);
                    slotEnd.setUTCMinutes(slotEnd.getUTCMinutes() + activeDuration);
                    if (slotEnd > sessionEnd) break;
                    const isBooked = bookedAppointments.some(appt => {
                        const apptStart = new Date(appt.scheduled_start);
                        const apptEnd = new Date(appt.scheduled_end);
                        return (apptStart < slotEnd && apptEnd > slotStart);
                    });
                    const slotObj = {
                        startTime: slotStart.toISOString().slice(11, 16),
                        endTime: slotEnd.toISOString().slice(11, 16),
                        isBooked,
                        durationApplied: activeDuration
                    };
                    // Validation check: ensure slot isn't in the past
                    if (slotStart > now || nextDayDate.getUTCDate() !== now.getUTCDate()) {
                        if (isBooked) bookedSlots.push(slotObj);
                        else availableSlots.push(slotObj);
                    }
                    slotStart = new Date(slotEnd);
                }
            });
        }
        // 4. Return combined response
        return successResponse(res, 200, "Appointment and next day slots fetched", {
            appointment: new AppointmentModel(appointment),
            nextDaySlots: {
                date: dateString,
                isFirstMeeting: !appointment,
                bookedSlots,
                availableSlots,
                workingHours: daySchedule || null
            }
        });
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// DELETE APPOINTMENT - Hard Delete
async function deleteAppointment(req: Request, res: Response) {
    logger.info({ component }, "Delete Appointment");
    try {
        const id = req.params.id;
        if (!id) return errorResponse(res, 400, "ID is required");
        // Hard delete or Soft delete depending on requirement. 
        // Based on schema 'status' field, we can soft delete by setting status to CANCELLED or DELETED if enum supports.
        // Assuming status 3 is Cancelled/Deleted for now based on context, or using delete method if hard delete is OK.
        // Usually appointments are cancelled, not deleted. But if explicit delete:
        await prisma.appointment.delete({ where: { id } });
        return successResponse(res, 200, "Appointment deleted successfully");
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// GET AVAILABLE SLOTS
async function getCoachSlots(req: Request, res: Response) {
    logger.info({ component }, "Get Coach Slots API Called");
    try {
        let { coach_id, date, client_id } = req.body;
        if (!coach_id || !date) {
            return errorResponse(res, 400, "coach_id and date are required");
        }
        // --- Client ID Resolution ---
        if (!client_id) {
            const user = (req as any).user;
            const role = user?.role || user?.role_name;
            if (role === "Client") {
                const clientProfile = await prisma.client.findUnique({ where: { user_id: user.id } });
                if (!clientProfile) return errorResponse(res, 404, "No Client profile found");
                client_id = clientProfile.id;
            } else {
                return errorResponse(res, 400, "client_id is required");
            }
        }
        // ---------- NEW: FIRST MEETING DURATION LOGIC ----------
        const existingAppointment = await prisma.appointment.findFirst({
            where: { coach_id, client_id },
            select: { id: true }
        });
        let overrideDuration: number | null = null;
        if (!existingAppointment) {
            const settings = await (prisma as any).settings.findFirst();
            if (settings?.first_meeting_duration) {
                overrideDuration = Number(settings.first_meeting_duration);
            }
        }
        const inputDate = new Date(date);
        if (isNaN(inputDate.getTime())) return errorResponse(res, 400, "Invalid date format");
        // 1. Fetch Working Hours
        const workingHoursRecord = await (prisma as any).workingHours.findFirst({
            where: { coachId: coach_id, isDeleted: 0 }
        });
        if (!workingHoursRecord || !workingHoursRecord.workingHours_of_Coach) {
            return errorResponse(res, 404, "Working hours not found for this coach");
        }
        // 2. Match Day of Week
        const dayIndex = inputDate.getDay(); // 0 (Sun) to 6 (Sat)
        const workingHoursList = workingHoursRecord.workingHours_of_Coach as any[];
        const daySchedule = workingHoursList.find((wh: any) => Number(wh.day) === dayIndex);
        if (!daySchedule || !daySchedule.sessions?.length) {
            return successResponse(res, 200, "Coach does not work on this day", {
                date, bookedSlots: [], availableSlots: [], workingHours: null
            });
        }
        // 3. Define Time Boundaries (USE UTC TO MATCH PRISMA)
        const startOfDay = new Date(inputDate);
        startOfDay.setUTCHours(0, 0, 0, 0); // Force UTC start of day
        const endOfDay = new Date(inputDate);
        endOfDay.setUTCHours(23, 59, 59, 999); // Force UTC end of day
        // 4. Fetch Booked Appointments
        const appointments = await prisma.appointment.findMany({
            where: {
                coach_id,
                scheduled_start: { gte: startOfDay, lte: endOfDay },
                status: { not: AppointmentStatusEnum.CANCELLED }
            },
            select: { scheduled_start: true, scheduled_end: true }
        });
        const availableSlots: any[] = [];
        const bookedSlots: any[] = [];
        // 5. Generate Slots
        daySchedule.sessions.forEach((session: any) => {
            const { startTime, endTime, durationPerSlot } = session;
            const activeDuration = overrideDuration || Number(durationPerSlot);
            const [startH, startM] = startTime.split(':').map(Number);
            const [endH, endM] = endTime.split(':').map(Number);
            // Create slot starts using UTC methods
            let slotStart = new Date(startOfDay);
            slotStart.setUTCHours(startH, startM, 0, 0);
            let sessionEnd = new Date(startOfDay);
            sessionEnd.setUTCHours(endH, endM, 0, 0);
            const now = new Date();
            while (slotStart < sessionEnd) {
                const slotEnd = new Date(slotStart);
                slotEnd.setUTCMinutes(slotEnd.getUTCMinutes() + activeDuration);
                if (slotEnd > sessionEnd) break;
                const isBooked = appointments.some(appt => {
                    const apptStart = new Date(appt.scheduled_start);
                    const apptEnd = new Date(appt.scheduled_end);
                    return (apptStart < slotEnd && apptEnd > slotStart);
                });
                const slotObj = {
                    startTime: slotStart.toISOString().slice(11, 16),
                    endTime: slotEnd.toISOString().slice(11, 16),
                    isBooked,
                    durationApplied: activeDuration
                };
                // Date comparison for "now" check
                if (slotStart > now || inputDate.getUTCDate() !== now.getUTCDate()) {
                    if (isBooked) bookedSlots.push(slotObj);
                    else availableSlots.push(slotObj);
                }
                slotStart = new Date(slotEnd);
            }
        });
        return successResponse(res, 200, "Slots fetched successfully", {
            date,
            isFirstMeeting: !existingAppointment,
            bookedSlots,
            availableSlots,
            workingHours: daySchedule
        });
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// CANCEL APPOINTMENT
async function cancelAppointment(req: Request, res: Response) {
    logger.info({ component }, "Cancel Appointment API Called", req.body);
    try {
        const { appointment_id, coach_id, client_id, edit_scope, cancel_reason } = req.body;
        if (!appointment_id || !edit_scope) {
            return errorResponse(res, 400, "appointment_id and edit_scope are required");
        }
        const user = (req as any).user;
        const role = user?.role || user?.role_name;
        const now = new Date();
        const appointment = await prisma.appointment.findUnique({
            where: { id: appointment_id },
            include: {
                coach: { select: { id: true, user_id: true, first_name: true, last_name: true } },
                client: { select: { id: true, user_id: true, first_name: true, last_name: true } }
            }
        });
        if (!appointment) {
            return errorResponse(res, 404, "Appointment not found");
        }
        if (appointment.status === AppointmentStatusEnum.CANCELLED) {
            return errorResponse(res, 400, "Appointment is already cancelled");
        }
        // ---------- AUTHORIZATION ----------
        let cancelled_by_id: string;
        let cancelled_by_name: string;
        if (role === "Coach") {
            const coachProfile = await prisma.coach.findUnique({ where: { user_id: user.id } });
            if (!coachProfile || coachProfile.id !== appointment.coach_id) {
                return errorResponse(res, 403, "You can only cancel your own appointments");
            }
            cancelled_by_id = coachProfile.user_id;
            cancelled_by_name = `${appointment.coach.first_name} ${appointment.coach.last_name} (Coach)`;
        } else if (role === "Client") {
            const clientProfile = await prisma.client.findUnique({ where: { user_id: user.id } });
            if (!clientProfile || clientProfile.id !== appointment.client_id) {
                return errorResponse(res, 403, "You can only cancel your own appointments");
            }
            cancelled_by_id = clientProfile.user_id;
            cancelled_by_name = `${appointment.client.first_name} ${appointment.client.last_name} (Client)`;
        } else if (role === "Admin" || role === "Staff") {
            cancelled_by_id = user.id;
            cancelled_by_name = role;
        } else {
            return errorResponse(res, 403, "Unauthorized");
        }
        // ---------- DETERMINE TARGET APPOINTMENTS ----------
        let whereClause: any = {
            status: { not: AppointmentStatusEnum.CANCELLED }
        };
        whereClause.coach_id = coach_id;
        // Check if client_id is missing and the user is a Client
        if (!client_id && role === "Client") {
            const clientProfile = await prisma.client.findUnique({
                where: { user_id: user.id }
            });
            whereClause.client_id = clientProfile?.id;
        } else if (client_id) {
            // If client_id was provided in the payload (e.g., by an Admin or Coach), use it
            whereClause.client_id = client_id;
        }
        if (edit_scope === "this_event") {
            whereClause.id = appointment_id;
        }
        if (edit_scope === "following_events") {
            if (!appointment.series_id) {
                return errorResponse(res, 400, "Appointment is not part of a series");
            }
            whereClause.series_id = appointment.series_id;
            whereClause.scheduled_start = { gte: appointment.scheduled_start };
        }
        if (edit_scope === "all_events") {
            if (!appointment.series_id) {
                return errorResponse(res, 400, "Appointment is not part of a series");
            }
            whereClause.series_id = appointment.series_id;
        }
        // Prevent cancelling past appointments for this_event/following_events
        if (edit_scope !== "all_events" && new Date(appointment.scheduled_start) < now) {
            return errorResponse(res, 400, "Cannot cancel past appointments");
        }
        // ---------- CANCEL APPOINTMENTS ----------
        const result = await prisma.appointment.updateMany({
            where: whereClause,
            data: {
                status: AppointmentStatusEnum.CANCELLED,
                cancelled_by: cancelled_by_id,
                cancel_reason: cancel_reason || "No reason provided",
                cancelled_at: new Date()
            }
        });
        logger.info(
            { component },
            `Cancelled ${result.count} appointment(s) by ${cancelled_by_name}`
        );
        return successResponse(res, 200, "Appointment(s) cancelled successfully", {
            cancelled_count: result.count,
            edit_scope
        });
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// DELETE MULTIPLE APPOINTMENTS
// async function cancel_Multiple_Appointments(req: Request, res: Response) {
//     logger.info({ component }, "Delete Multiple Appointments API Called", req.body);
//     try {
//         const { appointment_ids, cancel_reason } = req.body;
//         if (!appointment_ids || !Array.isArray(appointment_ids) || appointment_ids.length === 0) {
//             return errorResponse(res, 400, "Appointment IDs array is required");
//         }
//         const user = (req as any).user;
//         const role = user?.role || user?.role_name;
//         // Base where condition
//         const whereCondition: any = {
//             id: { in: appointment_ids },
//             status: { not: AppointmentStatusEnum.CANCELLED } // Only cancel active/pending ones
//         };
//         let cancelled_by_id: string = user.id;
//         // Role-based filtering to ensure ownership
//         if (role === 'Coach') {
//             const coachProfile = await prisma.coach.findUnique({ where: { user_id: user.id } });
//             if (!coachProfile) return errorResponse(res, 403, "Coach profile not found");
//             whereCondition.coach_id = coachProfile.id;
//             cancelled_by_id = coachProfile.user_id;
//         } else if (role === 'Client') {
//             const clientProfile = await prisma.client.findUnique({ where: { user_id: user.id } });
//             if (!clientProfile) return errorResponse(res, 403, "Client profile not found");
//             whereCondition.client_id = clientProfile.id;
//             cancelled_by_id = clientProfile.user_id;
//         }
//         // Admin/Staff can cancel any, so no extra filter needed
//         // Check if there are appointments to cancel
//         const countToCancel = await prisma.appointment.count({ where: whereCondition });
//         if (countToCancel === 0) {
//             return errorResponse(res, 404, "No valid or active appointments found to cancel (or permission denied)");
//         }
//         // Perform Bulk Update
//         await prisma.appointment.updateMany({
//             where: whereCondition,
//             data: {
//                 status: AppointmentStatusEnum.CANCELLED,
//                 cancelled_by: cancelled_by_id,
//                 cancel_reason: cancel_reason || "Bulk cancellation",
//                 cancelled_at: new Date()
//             }
//         });
//         return successResponse(res, 200, `${countToCancel} appointments cancelled successfully`);
//     } catch (error: any) {
//         logger.error({ component }, error.message);
//         return errorResponse(res, 500, error.message);
//     }
// }

// RESCHEDULE APPOINTMENT
// async function edit_Appointment_Single(req: Request, res: Response) {
//     logger.info({ component }, "Reschedule Appointment API Called", req.body);
//     try {
//         const id = req.body.appointment_id;
//         const {
//             scheduled_start,
//             scheduled_end,
//             duration_minutes,
//             timezone,
//             price,
//             currency,
//             coach_notes,
//             client_notes,
//             is_overlapped // Mandatory False, or True for Force Edit
//         } = req.body;
//         if (!id) return errorResponse(res, 400, "Appointment ID is required");
//         if (!scheduled_start || !scheduled_end) {
//             return errorResponse(res, 400, "New schedule details are required");
//         }
//         // 1. Fetch existing appointment
//         const existingAppointment = await prisma.appointment.findUnique({
//             where: { id },
//             include: {
//                 coach: { select: { id: true, user_id: true, first_name: true, last_name: true, email: true } },
//                 client: { select: { id: true, user_id: true, first_name: true, last_name: true, email: true } }
//             }
//         });
//         if (!existingAppointment) {
//             return errorResponse(res, 404, "Appointment not found");
//         }
//         if (existingAppointment.status !== 1 && existingAppointment.status !== 5) {
//             return errorResponse(res, 400, "Only scheduled appointments can be rescheduled");
//         }
//         // Authorization Check (Ensure only the assigned Coach or Client can reschedule)
//         const user = (req as any).user;
//         const role = user?.role || user?.role_name;
//         if (role === 'Coach') {
//             const coachProfile = await prisma.coach.findUnique({ where: { user_id: user.id } });
//             if (!coachProfile || existingAppointment.coach_id !== coachProfile.id) {
//                 return errorResponse(res, 403, "You can only reschedule your own appointments");
//             }
//         } else if (role === 'Client') {
//             const clientProfile = await prisma.client.findUnique({ where: { user_id: user.id } });
//             if (!clientProfile || existingAppointment.client_id !== clientProfile.id) {
//                 return errorResponse(res, 403, "You can only reschedule your own appointments");
//             }
//         } else if (role !== 'Admin' && role !== 'Staff') {
//             return errorResponse(res, 403, "Unauthorized to reschedule appointments");
//         }
//         const coach_id = existingAppointment.coach_id;
//         const requestedStart = new Date(scheduled_start);
//         const requestedEnd = new Date(scheduled_end);
//         // 1. Holiday Check
//         const startOfDay = new Date(requestedStart);
//         startOfDay.setHours(0, 0, 0, 0);
//         const holiday = await (prisma as any).holiday.findFirst({
//             where: {
//                 coachId: coach_id,
//                 holidayDate: startOfDay
//             }
//         });
//         if (holiday) {
//             return errorResponse(res, 400, "Coach is on holiday on this date");
//         }
//         // 2. Working Hours Check
//         const workingHours = await (prisma as any).workingHours.findFirst({
//             where: { coachId: coach_id, isDeleted: 0 }
//         });
//         if (!workingHours || !workingHours.workingHours_of_Coach) {
//             return errorResponse(res, 400, "Coach has no working hours defined");
//         }
//         // 1. Use getUTCDay() to match the UTC date
//         const dayIndex = Number(requestedStart.getUTCDay());
//         const daySchedule = workingHours.workingHours_of_Coach.find(
//             (d: any) => d.day === dayIndex
//         );
//         if (!daySchedule || !daySchedule.sessions?.length) {
//             return errorResponse(res, 400, "Coach is not working on this day");
//         }
//         // 2. Use UTC hours/minutes to compare against the session strings
//         const getMinutes = (h: number, m: number) => h * 60 + m;
//         const reqStartMin = requestedStart.getUTCHours() * 60 + requestedStart.getUTCMinutes();
//         const reqEndMin = requestedEnd.getUTCHours() * 60 + requestedEnd.getUTCMinutes();
//         const withinSession = daySchedule.sessions.some((s: any) => {
//             const [sh, sm] = s.startTime.split(":").map(Number);
//             const [eh, em] = s.endTime.split(":").map(Number);
//             const sessionStartMin = getMinutes(sh, sm);
//             const sessionEndMin = getMinutes(eh, em);
//             return reqStartMin >= sessionStartMin && reqEndMin <= sessionEndMin;
//         });
//         if (!withinSession) {
//             return errorResponse(res, 400, "Selected time is outside coach working hours");
//         }
//         // ---------- 3. OVERLAP CHECK (Exclude current appointment) ----------
//         if (!is_overlapped) {
//             const overlap = await prisma.appointment.findFirst({
//                 where: {
//                     coach_id: coach_id,
//                     id: { not: id }, // Exclude self
//                     status: { not: AppointmentStatusEnum.CANCELLED },
//                     scheduled_start: { lt: requestedEnd },
//                     scheduled_end: { gt: requestedStart }
//                 }
//             });
//             if (overlap) return errorResponse(res, 400, "Time slot overlaps with another appointment");
//         }
//         // ---------- 4. UPDATE APPOINTMENT ----------
//         const updatedAppointment = await prisma.appointment.update({
//             where: { id },
//             data: {
//                 scheduled_start: requestedStart,
//                 scheduled_end: requestedEnd,
//                 start_date: requestedStart,
//                 end_date: requestedEnd,
//                 duration_minutes,
//                 timezone,
//                 is_overlapped: is_overlapped,
//                 is_reschedule: 1,
//                 ...(price && { price }),
//                 ...(currency && { currency }),
//                 ...(coach_notes && { coach_notes }),
//                 ...(client_notes && { client_notes })
//             }
//         });
//         // Generate Calendar Links
//         const meeting_link = existingAppointment.meeting_link;
//         const calLink = generateGoogleCalendarLink(
//             `Session: ${existingAppointment.coach.first_name} vs ${existingAppointment.client.last_name}`,
//             `Coaching session via Dyte. Link: ${meeting_link}`,
//             "Online / Dyte",
//             requestedStart,
//             requestedEnd
//         );
//         const dateStr = requestedStart.toLocaleDateString();
//         const timeStr = requestedStart.toLocaleTimeString();
//         // Send Reschedule Email to Coach
//         if (existingAppointment.coach.email) {
//             await sendAppointmentReschedule({
//                 to: existingAppointment.coach.email,
//                 subject: `Appointment Rescheduled: Session with ${existingAppointment.client.first_name}`,
//                 clientName: `${existingAppointment.client.first_name} ${existingAppointment.client.last_name}`,
//                 coachName: `${existingAppointment.coach.first_name} ${existingAppointment.coach.last_name}`,
//                 date: dateStr,
//                 time: timeStr,
//                 meetingLink: meeting_link || undefined,
//                 calendarLink: calLink,
//                 platform: 'Dyte'
//             });
//         }
//         // Send Reschedule Email to Client
//         if (existingAppointment.client.email) {
//             await sendAppointmentReschedule({
//                 to: existingAppointment.client.email,
//                 subject: `Appointment Rescheduled: Session with Coach ${existingAppointment.coach.first_name}`,
//                 clientName: `${existingAppointment.client.first_name} ${existingAppointment.client.last_name}`,
//                 coachName: `${existingAppointment.coach.first_name} ${existingAppointment.coach.last_name}`,
//                 date: dateStr,
//                 time: timeStr,
//                 meetingLink: meeting_link || undefined,
//                 calendarLink: calLink,
//                 platform: 'Dyte'
//             });
//         }
//         return successResponse(res, 200, "Appointment rescheduled successfully", new AppointmentModel(updatedAppointment));
//     } catch (error: any) {
//         logger.error({ component }, error.message);
//         return errorResponse(res, 500, error.message);
//     }
// }

// APPROVE/REJECT APPOINTMENT
async function approveAppointment(req: Request, res: Response) {
    logger.info({ component }, "Approve Appointment API Called", req.body);
    try {
        const id = req.params.id;
        const { action } = req.body; // 'approve' | 'reject'
        if (!id || !action || !['approve', 'reject'].includes(action)) {
            return errorResponse(res, 400, "Valid ID and action ('approve' or 'reject') are required");
        }
        const user = (req as any).user;
        const role = user?.role || user?.role_name;
        const appointment = await prisma.appointment.findUnique({
            where: { id },
            include: {
                coach: { select: { id: true, user_id: true, first_name: true, last_name: true, email: true } },
                client: { select: { id: true, user_id: true, first_name: true, last_name: true, email: true } }
            }
        });
        if (!appointment) {
            return errorResponse(res, 404, "Appointment not found");
        }
        if (appointment.status !== AppointmentStatusEnum.PENDING) {
            return errorResponse(res, 400, "Only pending appointments can be approved or rejected");
        }
        // Authorization Check
        let approverName = "";
        let isAuthorized = false;
        if (role === 'Coach') {
            const coachProfile = await prisma.coach.findUnique({ where: { user_id: user.id } });
            if (coachProfile && appointment.coach_id === coachProfile.id) {
                isAuthorized = true;
                approverName = `${coachProfile.first_name} ${coachProfile.last_name}`;
            }
        } else if (role === 'Client') {
            const clientProfile = await prisma.client.findUnique({ where: { user_id: user.id } });
            if (clientProfile && appointment.client_id === clientProfile.id) {
                isAuthorized = true;
                approverName = `${clientProfile.first_name} ${clientProfile.last_name}`;
            }
        } else if (role === 'Admin' || role === 'Staff') {
            isAuthorized = true;
            approverName = "Admin/Staff";
        }
        if (!isAuthorized) {
            return errorResponse(res, 403, "Not authorized to manage this appointment");
        }
        if (action === 'reject') {
            const updated = await prisma.appointment.update({
                where: { id },
                data: { status: AppointmentStatusEnum.REJECTED }
            });
            // Send to Coach
            if (appointment.coach.email) {
                await sendAppointmentRejection({
                    to: appointment.coach.email,
                    subject: `Appointment Rejected`,
                    clientName: `${appointment.client.first_name} ${appointment.client.last_name}`,
                    coachName: `${appointment.coach.first_name} ${appointment.coach.last_name}`,
                    date: new Date(appointment.scheduled_start).toLocaleDateString(),
                    time: new Date(appointment.scheduled_start).toLocaleTimeString()
                });
            }
            // Send to Client
            if (appointment.client.email) {
                await sendAppointmentRejection({
                    to: appointment.client.email,
                    subject: `Appointment Rejected`,
                    clientName: `${appointment.client.first_name} ${appointment.client.last_name}`,
                    coachName: `${appointment.coach.first_name} ${appointment.coach.last_name}`,
                    date: new Date(appointment.scheduled_start).toLocaleDateString(),
                    time: new Date(appointment.scheduled_start).toLocaleTimeString()
                });
            }
            return successResponse(res, 200, "Appointment rejected");
        }
        // ACTION == APPROVE
        // 1. Create Dyte Meeting (Now we create it)
        let meeting_link = null;
        let coach_meeting_link = null;
        let client_meeting_link = null;
        let dyte_meeting_id = null;
        let dyte_room_name = null;
        let meeting_provider = "dyte";
        try {
            const meetingTitle = `Session with ${appointment.coach.first_name} and ${appointment.client.first_name}`;
            const dyteMeeting = await createMeeting(meetingTitle);
            dyte_meeting_id = dyteMeeting.id;
            // dyte_room_name = dyteMeeting.name;
            const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
            // Add Coach
            try {
                const coachParticipant = await addParticipant(
                    dyte_meeting_id,
                    `${appointment.coach.first_name} ${appointment.coach.last_name}`,
                    "host",
                    appointment.coach.id
                );
                coach_meeting_link = `${frontendUrl}/room/${dyte_room_name}?authToken=${coachParticipant.token}`;
            } catch (ignore) { }
            // Add Client
            try {
                const clientParticipant = await addParticipant(
                    dyte_meeting_id,
                    `${appointment.client.first_name} ${appointment.client.last_name}`,
                    "participant",
                    appointment.client.id
                );
                client_meeting_link = `${frontendUrl}/room/${dyte_room_name}?authToken=${clientParticipant.token}`;
            } catch (ignore) { }
            meeting_link = client_meeting_link || `${frontendUrl}/room/${dyte_room_name}`;
        } catch (err) {
            logger.error("Failed to create Dyte meeting during approval", err);
        }
        const updated = await prisma.appointment.update({
            where: { id },
            data: {
                status: AppointmentStatusEnum.SCHEDULED,
                meeting_link,
                dyte_meeting_id,
                dyte_room_name,
                meeting_provider
            }
        });
        // Send Confirmation Emails (Reuse logic)
        const calLink = generateGoogleCalendarLink(
            `Session: ${appointment.coach.first_name} vs ${appointment.client.last_name}`,
            `Coaching session via Dyte. Link: ${meeting_link}`,
            "Online / Dyte",
            new Date(updated.scheduled_start),
            new Date(updated.scheduled_end)
        );
        if (appointment.coach.email) {
            await sendAppointmentConfirmation({
                to: appointment.coach.email,
                subject: `Appointment Confirmed: Session with ${appointment.client.first_name}`,
                clientName: `${appointment.client.first_name} ${appointment.client.last_name}`,
                coachName: `${appointment.coach.first_name} ${appointment.coach.last_name}`,
                date: new Date(updated.scheduled_start).toLocaleDateString(),
                time: new Date(updated.scheduled_start).toLocaleTimeString(),
                meetingLink: coach_meeting_link || meeting_link || undefined,
                calendarLink: calLink,
                platform: 'Dyte'
            });
        }
        if (appointment.client.email) {
            await sendAppointmentConfirmation({
                to: appointment.client.email,
                subject: `Appointment Confirmed: Session with Coach ${appointment.coach.first_name}`,
                clientName: `${appointment.client.first_name} ${appointment.client.last_name}`,
                coachName: `${appointment.coach.first_name} ${appointment.coach.last_name}`,
                date: new Date(updated.scheduled_start).toLocaleDateString(),
                time: new Date(updated.scheduled_start).toLocaleTimeString(),
                meetingLink: client_meeting_link || meeting_link || undefined,
                calendarLink: calLink,
                platform: 'Dyte'
            });
        }
        return successResponse(res, 200, "Appointment approved successfully", new AppointmentModel(updated));
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

// RESCHEDULE MULTIPLE APPOINTMENTS
async function edit_Appointment(req: Request, res: Response) {
    logger.info({ component }, "Reschedule Multiple Appointments API Called", req.body);
    try {
        const id = req.body.appointment_id;
        const {
            edit_scope, // "this_event" | "following_events" | "all_events"
            coach_id, client_id, scheduled_start, scheduled_end, duration_minutes,
            timezone, meeting_type, repeat_unit, repeat_interval, recurrence_days,
            recurrence_start_date, recurrence_pattern_type,
            fixed_day_of_month, relative_week_index, relative_day_of_week,
            price, currency, coach_notes, client_notes, is_overlapped, no_of_sessions
        } = req.body;
        if (!id || !edit_scope) return errorResponse(res, 400, "Appointment ID and Edit Scope are required");
        // 1. Fetch Reference Data
        const refAppointment = await prisma.appointment.findUnique({
            where: { id },
            include: { coach: true, client: true }
        });
        if (!refAppointment) return errorResponse(res, 404, "Appointment not found");
        const coach = await prisma.coach.findUnique({ where: { id: coach_id || refAppointment.coach_id } });
        const client = await prisma.client.findUnique({ where: { id: client_id || refAppointment.client_id } });
        if (!coach || !client) return errorResponse(res, 404, "Coach or Client not found");
        // 2. Identify Affected Records
        let updateFilter: any = { id };
        if (edit_scope === "following_events") {
            updateFilter = {
                coach_id: coach.id,
                client_id: client.id,
                series_id: refAppointment.series_id,
                scheduled_start: { gte: refAppointment.scheduled_start },
                status: { not: AppointmentStatusEnum.CANCELLED }
            };
        } else if (edit_scope === "all_events") {
            updateFilter = {
                coach_id: coach.id,
                client_id: client.id,
                series_id: refAppointment.series_id,
                status: { not: AppointmentStatusEnum.CANCELLED }
            };
        }
        // 3. Generate Target Dates (RECURRENCE LOGIC SYNCED WITH CREATE API)
        const appointmentDates: Date[] = [];
        const seriesStart = new Date(recurrence_start_date || scheduled_start);
        const interval = parseInt(repeat_interval) || 1;
        const totalSessionsNeeded = parseInt(no_of_sessions) || 1;
        let current = new Date(seriesStart);
        if (edit_scope === "this_event" || meeting_type === "single") {
            appointmentDates.push(new Date(scheduled_start));
        } else {
            // Logic mirrored from createAppointment_Multiple
            while (appointmentDates.length < totalSessionsNeeded) {
                if (repeat_unit === 1) { // Daily
                    appointmentDates.push(new Date(current));
                    current.setDate(current.getDate() + interval);
                }
                else if (repeat_unit === 2 || repeat_unit === 3) { // Weekly or Bi-Weekly
                    const jumpMultiplier = repeat_unit === 3 ? 2 : 1;
                    const daysToMatch = recurrence_days.map(Number);
                    for (let i = 0; i < 7; i++) {
                        const checkDate = new Date(current);
                        checkDate.setDate(current.getDate() + i);

                        if (daysToMatch.includes(checkDate.getUTCDay()) && checkDate >= seriesStart) {
                            if (appointmentDates.length < totalSessionsNeeded) {
                                appointmentDates.push(new Date(checkDate));
                            }
                        }
                    }
                    current.setDate(current.getDate() + (7 * jumpMultiplier * interval));
                }
                else if (repeat_unit === 4) { // Monthly
                    let targetDate: Date;
                    if (recurrence_pattern_type === "fixed") {
                        const requestedDay = parseInt(fixed_day_of_month);
                        const lastDayInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
                        const actualDay = Math.min(requestedDay, lastDayInMonth);
                        targetDate = new Date(current.getFullYear(), current.getMonth(), actualDay);
                    } else {
                        targetDate = getRelativeDate(
                            current.getFullYear(), current.getMonth(),
                            parseInt(relative_week_index), parseInt(relative_day_of_week)
                        );
                    }
                    targetDate.setHours(seriesStart.getHours(), seriesStart.getMinutes(), 0, 0);
                    if (targetDate >= seriesStart) {
                        appointmentDates.push(new Date(targetDate));
                    }
                    current.setMonth(current.getMonth() + interval);
                }
                else if (repeat_unit === 5) { // Yearly
                    let targetDate: Date;
                    if (recurrence_pattern_type === "fixed") {
                        targetDate = new Date(current.getFullYear(), seriesStart.getMonth(), parseInt(fixed_day_of_month) || seriesStart.getDate());
                    } else {
                        targetDate = getRelativeDate(
                            current.getFullYear(), seriesStart.getMonth(),
                            parseInt(relative_week_index), parseInt(relative_day_of_week)
                        );
                    }
                    if (targetDate >= seriesStart) {
                        appointmentDates.push(targetDate);
                    }
                    current.setFullYear(current.getFullYear() + interval);
                }
            }
        }
        // CALCULATE FINAL RECURRENCE END DATE
        const calculatedRecurrenceEndDate = appointmentDates.length > 0
            ? appointmentDates[appointmentDates.length - 1]
            : seriesStart;
        // 4. HOLIDAY & WORKING HOURS VALIDATION LOOP
        const baseStart = new Date(scheduled_start);
        const baseEnd = new Date(scheduled_end);
        const validatedSlots: { start: Date; end: Date }[] = [];
        const workingHours = await (prisma as any).workingHours.findFirst({
            where: { coachId: coach.id, isDeleted: 0 }
        });
        if (!workingHours || !workingHours.workingHours_of_Coach) {
            return errorResponse(res, 400, "Coach has no working hours defined");
        }
        for (const date of appointmentDates) {
            const start = new Date(date);
            start.setUTCHours(baseStart.getUTCHours(), baseStart.getUTCMinutes(), 0);
            const end = new Date(date);
            end.setUTCHours(baseEnd.getUTCHours(), baseEnd.getUTCMinutes(), 0);
            // Holiday Check
            const startOfDay = new Date(start);
            startOfDay.setUTCHours(0, 0, 0, 0);
            const holiday = await (prisma as any).holiday.findFirst({
                where: { coachId: coach.id, holidayDate: startOfDay }
            });
            if (holiday) return errorResponse(res, 400, `Coach is on holiday on ${start.toDateString()}`);
            // Working Hours Check
            const dayIndex = Number(start.getUTCDay());
            const daySchedule = workingHours.workingHours_of_Coach.find((d: any) => d.day === dayIndex);
            if (!daySchedule || !daySchedule.sessions?.length) {
                return errorResponse(res, 400, `Coach does not work on ${start.toDateString()}`);
            }
            const reqStartMin = start.getUTCHours() * 60 + start.getUTCMinutes();
            const reqEndMin = end.getUTCHours() * 60 + end.getUTCMinutes();
            const withinSession = daySchedule.sessions.some((s: any) => {
                const [sh, sm] = s.startTime.split(":").map(Number);
                const [eh, em] = s.endTime.split(":").map(Number);
                return reqStartMin >= (sh * 60 + sm) && reqEndMin <= (eh * 60 + em);
            });
            if (!withinSession) {
                return errorResponse(res, 400, `Time ${start.toLocaleTimeString()} is outside working hours on ${start.toDateString()}`);
            }
            // Overlap Check
            if (!is_overlapped) {
                const overlap = await prisma.appointment.findFirst({
                    where: {
                        coach_id: coach.id,
                        client_id: client.id,
                        status: { not: AppointmentStatusEnum.CANCELLED },
                        scheduled_start: { lt: end },
                        scheduled_end: { gt: start },
                        id: { not: id }
                    }
                });
                if (overlap) return errorResponse(res, 400, `Overlap detected on ${start.toDateString()}`);
            }
            validatedSlots.push({ start, end });
        }
        // 5. Atomic Update: Wipe old and Create new
        await prisma.appointment.deleteMany({ where: updateFilter });
        const createdAppointments = [];
        for (const slot of validatedSlots) {
            const dyteMeeting = await createMeeting(`Rescheduled Session with ${coach.first_name}`);
            const participant = await addParticipant(dyteMeeting.id, `${client.first_name} ${client.last_name}`, "participant", client.id);
            const meetingLink = `${process.env.FRONTEND_URL}/room/${dyteMeeting.name || dyteMeeting.id}?authToken=${participant.token}`;
            const appt = await prisma.appointment.create({
                data: {
                    series_id: refAppointment.series_id,
                    coach_id: coach.id, client_id: client.id,
                    scheduled_start: slot.start, scheduled_end: slot.end,
                    start_date: slot.start, end_date: slot.end,
                    duration_minutes, timezone, price, currency,
                    coach_notes, client_notes, is_overlapped,
                    status: AppointmentStatusEnum.PENDING,
                    meeting_type, meeting_link: meetingLink, dyte_meeting_id: dyteMeeting.id,
                    repeat_unit, repeat_interval, recurrence_days,
                    is_reschedule: 1, recurrence_pattern_type,
                    fixed_day_of_month, relative_week_index, relative_day_of_week,
                    no_of_sessions: totalSessionsNeeded,
                    recurrence_end_date: calculatedRecurrenceEndDate, // Using the calculated date
                    ...(recurrence_start_date && {
                        recurrence_start_date: new Date(recurrence_start_date)
                    }),
                }
            });
            // Send Email
            await sendAppointmentConfirmation({
                to: client.email!,
                subject: "Session Rescheduled",
                clientName: client.first_name,
                coachName: coach.first_name,
                date: slot.start.toLocaleDateString(),
                time: formatTo12HourUTC(slot.start),
                meetingLink,
                calendarLink: generateGoogleCalendarLink("Coach Session", "Rescheduled", "Online", slot.start, slot.end),
                platform: "Dyte"
            });
            createdAppointments.push(appt);
        }
        return successResponse(res, 200, "Series Rescheduled successfully", { appointments: createdAppointments, count: createdAppointments.length });
    } catch (error: any) {
        logger.error({ component }, error.message);
        return errorResponse(res, 500, error.message);
    }
}

function formatTo12HourUTC(date: Date): string {
    let hours = date.getUTCHours(); // Use UTC
    const minutes = date.getUTCMinutes(); // Use UTC
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const strMinutes = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${strMinutes} ${ampm}`;
}

export default {
    createAppointment_Single,
    createAppointment_Multiple,
    getAllAppointments,
    getAppointmentById,
    deleteAppointment,
    getCoachSlots,
    cancelAppointment,
    // cancel_Multiple_Appointments,
    // edit_Appointment_Single,
    approveAppointment,
    edit_Appointment
};