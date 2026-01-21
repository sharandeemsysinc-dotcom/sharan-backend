import { Request, Response } from "express";
import prisma from "../config/prisma";
import logger from "../utils/logger";
import { successResponse, errorResponse } from "../utils/responseHandler";
import { randomUUID } from "crypto";

const component = "Working Hour Controller";
// Helper function for mapping index to name (for better messaging)
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Handle Async Wrapper
async function handle<T>(promise: Promise<T>): Promise<[any, T | undefined]> {
  try {
    const data = await promise;
    return [null, data];
  } catch (error) {
    return [error, undefined];
  }
}

// Get Working Hours by Coach Id
async function get_Working_Hours_by_coachId(req: Request, res: Response) {
  const coach_user_Id = req.user.id;
  let [err, coach] = await handle(prisma.coach.findUnique({ where: { user_id: coach_user_Id } }));
  if (err) return errorResponse(res, 500, "Failed to fetch coach data");
  const coachId = coach?.id;
  const component = "GetWorkingHoursById";
  logger.info({ component }, `Fetching Working Hours for ID: ${coachId}`);
  try {
    if (!coachId) {
      return errorResponse(res, 400, "Working Hours ID is missing in request parameters.");
    }
    let [err, workingHours] = await handle(
      prisma.workingHours.findFirst({
        where: { coachId },
      })
    );
    if (err) {
      logger.error({ component, err }, "Database error while fetching Working Hours");
      return errorResponse(res, 500, "Failed to fetch working hours due to a server error.");
    }
    if (!workingHours) {
      const defaultWorkingHours = {
        coachId,
        isDeleted: 0,
        workingHours_of_Coach: []
      };
      return successResponse(
        res,
        200,
        "Working hours fetched successfully",
        defaultWorkingHours
      );
    }
    if (workingHours.isDeleted == 2) {
      const defaultWorkingHours = {
        coachId,
        isDeleted: 0,
        workingHours_of_Coach: []
      };
      return successResponse(
        res,
        200,
        "Working hours fetched successfully",
        defaultWorkingHours
      );
    }
    else {
      return successResponse(res, 200, "Working hours fetched successfully", workingHours);
    }
  } catch (err) {
    logger.error({ component, err }, "Unexpected error in Get Working Hours By ID function");
    return errorResponse(res, 500, "Server error");
  }
}

// Update Working Hours
async function update_Working_Hours(req: Request, res: Response) {
  logger.info({ component }, "Update Working Hours", req.body);
  try {
    const { workingHours_of_Coach } = req.body;
    const coach_user_Id = req.user.id;
    let [err, coach] = await handle(prisma.coach.findUnique({ where: { user_id: coach_user_Id } }));
    if (err || !coach) return errorResponse(res, 500, "Failed to fetch coach data");
    const coachId = coach.id;
    if (!workingHours_of_Coach || !Array.isArray(workingHours_of_Coach)) {
      return errorResponse(res, 400, "Invalid Payload structure: Expected 'workingHours_of_Coach' to be an array.");
    }
    const dbWorkingHours = [];
    for (const dayEntry of workingHours_of_Coach) {
      const dayIndex = typeof dayEntry.day === 'string' ? parseInt(dayEntry.day) : dayEntry.day;
      const sessionSet = new Set<string>();
      const processedSessions = (dayEntry.sessions || []).map((session: any) => {
        const { startTime, endTime } = session;
        const sessionKey = `${startTime}-${endTime}`;
        if (sessionSet.has(sessionKey)) {
          throw new Error(`Duplicate session ${sessionKey} found on day ${dayEntry.day}`);
        }
        sessionSet.add(sessionKey);
        const [sh, sm] = startTime.split(":").map(Number);
        const [eh, em] = endTime.split(":").map(Number);
        const durationPerSession = (eh * 60 + em) - (sh * 60 + sm);
        if (durationPerSession <= 0) {
          throw new Error(`Invalid session time ${startTime} - ${endTime} on day ${dayEntry.day}`);
        }
        return {
          startTime,
          endTime,
          isAvailable: session.isAvailable ?? true,
          sessionId: randomUUID(),
          durationPerSlot: 30,
          durationPerSession
        };
      });
      if (dayEntry.isDeleted !== 0) {
        const appointmentsToCancel = await getAllAppointmentsByDayOfWeek(dayIndex, coachId);
        if (appointmentsToCancel.length > 0) {
          const appointmentIds = appointmentsToCancel.map(a => a.id);
          const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayIndex];
          await prisma.appointment.updateMany({
            where: { id: { in: appointmentIds } },
            data: {
              status: 3, // CANCELLED
              cancelled_by: coach_user_Id,
              cancel_reason: `Coach removed ${dayName} from working hours schedule.`,
              cancelled_at: new Date()
            }
          });
        }
      }
      dbWorkingHours.push({
        day: dayIndex,
        isDeleted: dayEntry.isDeleted,
        sessions: processedSessions,
        sessionCount: processedSessions.length
      });
    }
    const masterRecord = await prisma.workingHours.findFirst({
      where: { coachId },
    });
    let result;
    if (!masterRecord) {
      result = await prisma.workingHours.create({
        data: {
          coachId,
          isDeleted: 0,
          workingHours_of_Coach: dbWorkingHours,
          created_at: new Date(),
          updated_at: new Date(),
        }
      });
    } else {
      result = await prisma.workingHours.update({
        where: { id: masterRecord.id },
        data: {
          workingHours_of_Coach: dbWorkingHours,
          updated_at: new Date(),
          isDeleted: 0,
        }
      });
    }
    return successResponse(res, 200, "Working hours updated and appointments managed successfully", result);
  } catch (err: any) {
    logger.error({ component, err }, "Error in update_Working_Hours");
    return errorResponse(res, 400, err.message || "Server error");
  }
}

// Soft Delete Working Hours
// async function soft_Delete_Working_Hours_By_Day(req: Request, res: Response) {
//   logger.info({ component }, "Soft Delete Working Hours By Day", req.body);
//   const coach_user_Id = req.user.id;
//   try {
//     const { day } = req.body;
//     if (!day || typeof day !== 'string') {
//       return errorResponse(res, 400, "Invalid or missing 'day' in payload. Expected string numeral ('0' - '6').");
//     }
//     const dayIndex = parseInt(day, 10);
//     if (isNaN(dayIndex) || dayIndex < 0 || dayIndex > 6) {
//       return errorResponse(res, 400, "Invalid day index provided. Must be a numeral string between '0' (Sunday) and '6' (Saturday).");
//     }
//     const dayName = dayNames[dayIndex];
//     let [err, coach] = await handle(prisma.coach.findUnique({ where: { user_id: coach_user_Id } }));
//     if (err) return errorResponse(res, 500, "Failed to fetch coach data");
//     const coachId = coach?.id;
//     if (!coachId) {
//       return errorResponse(res, 400, "Coach Id Not Found");
//     }
//     const masterRecord = await prisma.workingHours.findFirst({
//       where: { coachId },
//     });
//     if (!masterRecord) {
//       return errorResponse(res, 404, "Working hours record not found for this coach.");
//     }
//     if (masterRecord.isDeleted === 2) {
//       return errorResponse(res, 400, "Cannot modify, the main working hours record is globally soft deleted.");
//     }
//     let existingWorkingHours = masterRecord.workingHours_of_Coach as any[];
//     let dayFound = false;
//     let dayAlreadyDeleted = false;
//     const updatedWorkingHours = existingWorkingHours.map((dayItem: any) => {
//       if (dayItem.day === day) {
//         dayFound = true;
//         if (dayItem.isDeleted === 2) {
//           dayAlreadyDeleted = true;
//           return dayItem;
//         }
//         return {
//           ...dayItem,
//           isDeleted: 2,
//         };
//       }
//       return dayItem;
//     });
//     if (!dayFound) {
//       return errorResponse(res, 404, `Working hours for day ${dayName} (index ${day}) not found.`);
//     }
//     if (dayAlreadyDeleted) {
//       return successResponse(res, 200, `Working hours for day ${dayName} is already soft deleted.`, masterRecord);
//     }
//     const allDaysSoftDeleted = updatedWorkingHours.every((dayItem: any) => dayItem.isDeleted === 2);
//     let newIsDeletedStatus = masterRecord.isDeleted;
//     if (allDaysSoftDeleted) {
//       newIsDeletedStatus = 2;
//     }
//     let appointmentIdsToCancel: string[] = [];
//     try {
//       const appointments = await getAllAppointmentsByDayOfWeek(dayIndex, coachId);
//       appointmentIdsToCancel = appointments.map(a => a.id);
//     } catch (e) {
//       logger.warn({ component, error: e }, "Appointment check failed, proceeding with working hours update.");
//     }
//     const [transactionErr, transactionResult] = await handle(prisma.$transaction(async (tx) => {
//       let cancelCount = 0;
//       if (appointmentIdsToCancel.length > 0) {
//         const updateResult = await tx.appointment.updateMany({
//           where: {
//             id: { in: appointmentIdsToCancel },
//           },
//           data: {
//             status: 3, // CANCELLED
//             cancelled_by: coach_user_Id,
//             cancel_reason: `Coach removed ${dayName} from working hours schedule.`,
//             cancelled_at: new Date()
//           }
//         });
//         cancelCount = updateResult.count;
//         logger.info({ component, cancelCount }, `Cancelled ${cancelCount} appointments for soft-deleted day ${dayName}.`);
//       }
//       const updated_Data = await tx.workingHours.update({
//         where: { id: masterRecord.id },
//         data: {
//           workingHours_of_Coach: updatedWorkingHours,
//           isDeleted: newIsDeletedStatus,
//           updated_at: new Date(),
//         }
//       });
//       return { updated_Data, cancelCount };
//     }));
//     if (transactionErr) {
//       logger.error({ component, error: transactionErr }, "Transaction failed during working hours and appointment update.");
//       return errorResponse(res, 500, "Failed to complete the soft delete and appointment cancellation due to a database error.");
//     }
//     if (!transactionResult) {
//       logger.error({ component }, "Transaction completed successfully but returned an undefined result.");
//       return errorResponse(res, 500, "An unexpected error occurred after successful database operations.");
//     }
//     const { updated_Data, cancelCount } = transactionResult;
//     let message = `Working hours for day ${dayName} soft deleted successfully (isDeleted set to 2).`;
//     if (cancelCount > 0) {
//       message += ` ${cancelCount} future appointments were also cancelled.`;
//     }
//     if (updated_Data.isDeleted === 2) {
//       message += " The main working hours record has also been soft deleted as all days are now deactivated.";
//     }
//     return successResponse(res, 200, message, updated_Data);
//   } catch (err) {
//     logger.error({ component, err }, "Error Soft Delete Working Hours By Day");
//     return errorResponse(res, 500, "Server error during soft delete by day");
//   }
// }

// Service Function - Has Appointment
async function getAllAppointmentsByDayOfWeek(dayOfWeekIndex: number, coachId: string): Promise<any[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endWindow = new Date(today);
  endWindow.setFullYear(today.getFullYear() + 1); // 1 Year
  // endWindow.setDate(today.getDate() + (8 * 7)); // 8 weeks in the future
  let appointments: any[] | null | undefined = null;
  let appointmentsErr: Error | null = null;
  [appointmentsErr, appointments] = await handle(
    prisma.appointment.findMany({
      where: {
        coach_id: coachId,
        status: {
          in: [0, 1]
        },
        scheduled_start: {
          gte: today,
          lte: endWindow,
        },
      },
      select: {
        id: true,
        scheduled_start: true,
        scheduled_end: true,
      }
    })
  );
  if (appointmentsErr) {
    logger.error({ component: 'getAllAppointmentsByDayOfWeek', error: appointmentsErr }, "Database error fetching appointments");
    throw new Error("Failed to retrieve appointments due to a database error.");
  }
  if (!appointments || appointments.length === 0) {
    return [];
  }
  const filteredAppointments = appointments.filter(appointment => {
    const appointmentDayOfWeek = appointment.scheduled_start.getDay();
    return appointmentDayOfWeek === dayOfWeekIndex;
  });
  return filteredAppointments;
}

// check_appointments_for_Day
async function check_appointments_for_Day(req: Request, res: Response) {
  const component = "check_appointments_for_Day_recurring";
  logger.info({ component }, "Checking appointments for recurring Day of Week.", req.body);
  const { day } = req.body;
  const coachUserId = req.user.id;
  if (day === undefined || day === null) {
    return errorResponse(res, 400, "Missing 'day' in the request body.");
  }
  const dayIndex = parseInt(day, 10);
  if (isNaN(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    return errorResponse(res, 400, "Invalid day index provided. Must be a number between 0 (Sunday) and 6 (Saturday).");
  }
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = dayNames[dayIndex];
  let [coachErr, coach] = await handle(
    prisma.coach.findUnique({ where: { user_id: coachUserId } })
  );
  if (coachErr || !coach) {
    logger.warn({ component, coachUserId }, "Coach record not found for user ID during check attempt.");
    return errorResponse(res, 403, "Authorization failed: Coach record not found.");
  }
  const coachId = coach.id;
  let appointments: { id: string, scheduled_start: Date }[] = [];
  let appointmentsErr: any;
  try {
    appointments = await getAllAppointmentsByDayOfWeek(dayIndex, coachId);
  } catch (e) {
    appointmentsErr = e;
    logger.error({ component, coachId, error: appointmentsErr }, "Error while checking recurring appointments.");
    return errorResponse(res, 500, "An internal server error occurred while checking appointments.");
  }
  if (appointments.length > 0) {
    const firstAppointmentTime = appointments[0]!.scheduled_start;
    logger.warn({ component, coachId, firstAppointmentTime }, "Recurring appointments found. Blocking operation.");
    return errorResponse(
      res,
      409, // Conflict
      `Found ${appointments.length} future appointments on ${dayName}. Please cancel these before deleting working hours for this day.`
    );
  }
  logger.info({ component, coachId }, `No active appointments found on any future ${dayName}. Proceeding.`);
  return res.status(200).json({
    message: `No conflicting appointments found on any future ${dayName}. Proceed with the action.`,
    can_proceed: true,
    day_checked: dayName
  });
}

// Enable / Disable Session
async function enable_Disable_Session(req: Request, res: Response) {
  const component = "enable_Disable_Session";
  logger.info({ component }, "Enable / Disable Session", req.body);
  try {
    const { day, sessionId } = req.body;
    const coachUserId = req.user.id;
    if (day === undefined || !sessionId) {
      return errorResponse(res, 400, "Missing 'day' or 'sessionId' in request body.");
    }
    const coach = await prisma.coach.findUnique({ where: { user_id: coachUserId } });
    if (!coach) return errorResponse(res, 404, "Coach not found.");
    const masterRecord = await prisma.workingHours.findFirst({
      where: { coachId: coach.id, isDeleted: 0 },
    });
    if (!masterRecord || !masterRecord.workingHours_of_Coach) {
      return errorResponse(res, 404, "Working hours record not found.");
    }
    const workingHoursArray = masterRecord.workingHours_of_Coach as any[];
    const dayIndex = Number(day);
    const dayObject = workingHoursArray.find((d: any) => Number(d.day) === dayIndex);
    if (!dayObject) {
      return errorResponse(res, 404, `Schedule for day ${dayIndex} not found.`);
    }
    const session = dayObject.sessions.find((s: any) => s.sessionId === sessionId);
    if (!session) {
      return errorResponse(res, 404, "Session ID not found.");
    }
    const currentStatus = session.isAvailable;
    const newStatus = !currentStatus;
    if (currentStatus === true) {
      const { startTime, endTime } = session;
      const appointments = await prisma.appointment.findMany({
        where: {
          coach_id: coach.id,
          status: { in: [0, 1] },
          scheduled_start: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      });
      const conflictingAppointments = appointments.filter(app => {
        const coachTimezone = app.timezone || 'Asia/Kolkata';
        const appointmentLocalDay = new Date(
          new Date(app.scheduled_start).toLocaleString('en-US', { timeZone: coachTimezone })
        ).getDay();
        if (appointmentLocalDay !== dayIndex) return false;
        const [sH, sM] = startTime.split(':').map(Number);
        const [eH, eM] = endTime.split(':').map(Number);
        const appDate = new Date(app.scheduled_start);
        const appTimeInMins = (appDate.getUTCHours() * 60) + appDate.getUTCMinutes();
        const slotStartInMins = (sH * 60) + sM;
        const slotEndInMins = (eH * 60) + eM;
        return appTimeInMins >= slotStartInMins && appTimeInMins < slotEndInMins;
      });
      if (conflictingAppointments.length > 0) {
        const appointmentIds = conflictingAppointments.map(a => a.id);
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        await prisma.appointment.updateMany({
          where: { id: { in: appointmentIds } },
          data: {
            status: 3, // CANCELLED
            cancelled_by: coachUserId,
            cancel_reason: `Coach disabled the ${startTime} session on ${dayNames[dayIndex]}s.`,
            cancelled_at: new Date()
          }
        });
        logger.info({ component, count: appointmentIds.length }, "Cancelled appointments for disabled session.");
      }
    }
    session.isAvailable = newStatus;
    const updatedRecord = await prisma.workingHours.update({
      where: { id: masterRecord.id },
      data: {
        workingHours_of_Coach: workingHoursArray,
        updated_at: new Date()
      }
    });
    return successResponse(res, 200, `Session ${newStatus ? 'enabled' : 'disabled'} successfully.`, updatedRecord);
  } catch (err: any) {
    logger.error({ component, err }, "Error in enable_Disable_Session");
    return errorResponse(res, 500, err.message || "Internal server error");
  }
}

// Delete Session
async function delete_Session(req: Request, res: Response) {
  const component = "delete_Session";
  logger.info({ component }, "Delete Session", req.body);
  try {
    const { day, sessionId } = req.body;
    const coach_user_Id = req.user.id;
    if (day === undefined || !sessionId) {
      return errorResponse(res, 400, "Missing 'day' or 'sessionId' in payload.");
    }
    let [err, coach] = await handle(prisma.coach.findUnique({ where: { user_id: coach_user_Id } }));
    if (err || !coach) return errorResponse(res, 500, "Failed to fetch coach data");
    const coachId = coach.id;
    const masterRecord = await prisma.workingHours.findFirst({
      where: { coachId, isDeleted: 0 },
    });
    if (!masterRecord || !masterRecord.workingHours_of_Coach) {
      return errorResponse(res, 404, "No working hours record found.");
    }
    const workingHoursArray = masterRecord.workingHours_of_Coach as any[];
    const dayIndex = Number(day);
    const dayObject = workingHoursArray.find((d: any) => Number(d.day) === dayIndex);
    if (!dayObject) {
      return errorResponse(res, 404, `No schedule found for day ${dayIndex}.`);
    }
    const sessionToDelete = dayObject.sessions.find((s: any) => s.sessionId === sessionId);
    if (!sessionToDelete) {
      return errorResponse(res, 404, "Session ID not found in the specified day.");
    }
    const { startTime, endTime } = sessionToDelete;
    const appointmentsToCancel = await prisma.appointment.findMany({
      where: {
        coach_id: coachId,
        status: { in: [0, 1] },
        scheduled_start: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      },
      orderBy: {
        scheduled_start: 'asc'
      }
    });
    const conflictingAppointments = appointmentsToCancel.filter(app => {
      const appDate = new Date(app.scheduled_start);
      if (appDate.getDay() !== dayIndex) return false;
      const appStartHour = appDate.getHours();
      const appStartMin = appDate.getMinutes();
      const [sH, sM] = startTime.split(':').map(Number);
      const [eH, eM] = endTime.split(':').map(Number);
      const appTimeInMins = appStartHour * 60 + appStartMin;
      const slotStartInMins = sH * 60 + sM;
      const slotEndInMins = eH * 60 + eM;
      return appTimeInMins >= slotStartInMins && appTimeInMins < slotEndInMins;
    });
    if (conflictingAppointments.length > 0) {
      const appointmentIds = conflictingAppointments.map(a => a.id);
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      logger.info({ component, count: appointmentIds.length }, "Cancelling conflicting appointments.");
      await prisma.appointment.updateMany({
        where: { id: { in: appointmentIds } },
        data: {
          status: 3, // CANCELLED
          cancelled_by: coach_user_Id,
          cancel_reason: `Coach removed the ${startTime}-${endTime} session on ${dayNames[dayIndex]}s.`,
          cancelled_at: new Date()
        }
      });
    }
    dayObject.sessions = dayObject.sessions.filter((s: any) => s.sessionId !== sessionId);
    dayObject.sessionCount = dayObject.sessions.length;
    const result = await prisma.workingHours.update({
      where: { id: masterRecord.id },
      data: {
        workingHours_of_Coach: workingHoursArray,
        updated_at: new Date()
      }
    });
    return successResponse(res, 200, "Session deleted and related appointments cancelled successfully.", result);
  } catch (err: any) {
    logger.error({ component, err }, "Error in delete_Session");
    return errorResponse(res, 400, err.message || "Server error");
  }
}

export default {
  get_Working_Hours_by_coachId,
  update_Working_Hours,
  // soft_Delete_Working_Hours_By_Day,
  check_appointments_for_Day,
  enable_Disable_Session,
  delete_Session
};