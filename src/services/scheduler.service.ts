import cron from 'node-cron';
import prisma from '../config/prisma';
import logger from '../utils/logger';
import { AppointmentStatusEnum } from '../models/appointment';
import { getMeetingSessions } from './dyte.service';

export const initScheduler = () => {
    logger.info('[Scheduler] Initializing Scheduler Service...');

    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            // Buffer: 5 minutes after end_date to allow for late wrap-up before declaring it finished
            const bufferTime = new Date(now.getTime() - 5 * 60000);

            // Find PENDING appointments that have ended (end_date < now - buffer)
            const staleAppointments = await prisma.appointment.findMany({
                where: {
                    status: AppointmentStatusEnum.PENDING,
                    end_date: {
                        lt: bufferTime // Look for appointments that should have finished by now
                    }
                }
            });

            if (staleAppointments.length > 0) {
                logger.info(`[Scheduler] Found ${staleAppointments.length} stale PENDING appointments. Checking status...`);

                for (const appt of staleAppointments) {
                    if (appt.dyte_meeting_id) {
                        // Check Dyte Sessions
                        // If session exists -> It happened -> Mark COMPLETED (or maybe SCHEDULED then COMPLETED? But logic says if they forgot to approve, we assume it's done if they met.)
                        // Requirement: "if end date is 1 min ahead check the meeting status in dyte and update it in database if coach or client forget to approve/reject the meet in application"

                        const sessions = await getMeetingSessions(appt.dyte_meeting_id);

                        // Logic: If any session has participants > 1 (Coach + Client) for > X minutes?
                        // Simple check: If any session detected with duration > 1 min

                        // Note: dyte sessions return array of sessions.
                        // Participant check might need digging into session details.
                        // Assuming session list implies activity.

                        if (sessions && sessions.length > 0) {
                            // Meeting happened
                            logger.info(`[Scheduler] Appt ${appt.id}: Meeting activity detected. Marking as COMPLETED.`);
                            await prisma.appointment.update({
                                where: { id: appt.id },
                                data: { status: AppointmentStatusEnum.COMPLETED }
                            });
                        } else {
                            // No meeting activity -> Cancelled / Expired
                            // If they didn't approve AND didn't meet -> Cancelled
                            logger.info(`[Scheduler] Appt ${appt.id}: No meeting activity. Marking as CANCELLED (Expired).`);
                            await prisma.appointment.update({
                                where: { id: appt.id },
                                data: {
                                    status: AppointmentStatusEnum.CANCELLED,
                                    cancel_reason: "System Auto-Cancel: Not approved and no activity detected."
                                }
                            });
                        }
                    } else {
                        // No Dyte ID? Should check manually.
                        logger.warn(`[Scheduler] Appt ${appt.id} has no Dyte ID but is PENDING and passed. Ignoring.`);
                    }
                }
            }

        } catch (error) {
            logger.error('[Scheduler] Error running cron job', error);
        }
    });

    logger.info('[Scheduler] Scheduler running.');
};
