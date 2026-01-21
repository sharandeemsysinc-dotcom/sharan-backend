import { sendEmail } from "../utils/sendMail";
import logger from "../utils/logger";

interface AppointmentEmailProps {
    to: string;
    subject: string;
    clientName: string;
    coachName: string;
    date: string;
    time: string;
    meetingLink?: string | undefined;
    calendarLink?: string | undefined;
    platform?: string | undefined;
    actionUrl?: string; // Link to approve/reject in app
}

const getBaseTemplate = (title: string, bodyObj: Record<string, string>, footerLink?: { text: string, url: string }, extraHtml: string = '') => {
    const listItems = Object.entries(bodyObj).map(([key, value]) => `
        <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee;">
            <span style="color: #666; font-weight: 500;">${key}</span>
            <span style="color: #333; font-weight: 600; text-align: right;">${value}</span>
        </div>
    `).join('');

    return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #f0f0f0;">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">${title}</h1>
        </div>
        <div style="padding: 30px;">
            <div style="margin-bottom: 25px;">
                ${listItems}
            </div>
            ${extraHtml}
            ${footerLink ? `
            <div style="text-align: center; margin-top: 30px;">
                <a href="${footerLink.url}" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; box-shadow: 0 2px 5px rgba(79, 70, 229, 0.3); transition: all 0.2s;">${footerLink.text}</a>
            </div>
            ` : ''}
        </div>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #f1f5f9;">
            <p style="margin: 0;">© 2024 Alefitt using Dyte. All rights reserved.</p>
        </div>
    </div>
    `;
};

export const sendAppointmentConfirmation = async ({
    to,
    subject,
    clientName,
    coachName,
    date,
    time,
    meetingLink,
    calendarLink,
    platform
}: AppointmentEmailProps) => {

    const details: any = {
        'Coach': coachName,
        'Client': clientName,
        'Date': date,
        'Time': time,
        'Platform': platform || 'Dyte'
    };
    if (meetingLink) details['Join Link'] = `<a href="${meetingLink}" style="color: #4f46e5; text-decoration: none;">Link</a>`;

    // Always provide Calendar Link button
    const calendarBtn = calendarLink ? `
        <div style="text-align: center; margin-top: 20px;">
            <a href="${calendarLink}" style="color: #6366f1; font-weight: 500; font-size: 14px; text-decoration: none; border: 1px solid #e0e7ff; padding: 8px 16px; border-radius: 20px;">📅 Add to Google Calendar</a>
        </div>
    ` : '';

    const html = getBaseTemplate("Appointment Scheduled", details, undefined, `
        <div style="background-color: #fffbeb; color: #b45309; padding: 15px; border-radius: 8px; font-size: 14px; text-align: center; margin-top: 20px; border: 1px solid #fcd34d;">
            <strong>Note:</strong> This appointment is PENDING approval. You will be notified once confirmed.
        </div>
        ${calendarBtn}
    `);

    try {
        await sendEmail({ to, subject, html, text: `Appointment Scheduled. Please check app for details.` });
        logger.info(`Appointment email sent to ${to}`);
    } catch (error) {
        logger.error(`Failed to send appointment email to ${to}`, error);
    }
};

export const sendAppointmentRequest = async ({
    to,
    subject,
    clientName,
    coachName,
    date,
    time,
    platform,
    actionUrl
}: AppointmentEmailProps) => {
    const details = {
        'Requester': clientName, // Assuming Client requested
        'Coach': coachName,
        'Date': date,
        'Time': time,
        'Platform': platform || 'Dyte'
    };

    const html = getBaseTemplate("Action Required", details, { text: "Approve / Reject Appointment", url: actionUrl || '#' }, `
        <p style="text-align: center; color: #666; margin-top: 10px;">Please login to approve or reject this request.</p>
    `);

    try {
        await sendEmail({ to, subject, html, text: `New Appointment Request from ${clientName}. Please approve in dashboard.` });
        logger.info(`Appointment request email sent to ${to}`);
    } catch (error) {
        logger.error(`Failed to send request email to ${to}`, error);
    }
};

export const sendAppointmentReschedule = async ({
    to,
    subject,
    clientName,
    coachName,
    date,
    time,
    meetingLink,
    calendarLink,
    platform
}: AppointmentEmailProps) => {

    const details: any = {
        'Coach': coachName,
        'Client': clientName,
        'New Date': date,
        'New Time': time,
        'Platform': platform || 'Dyte'
    };
    if (meetingLink) details['Join Link'] = `<a href="${meetingLink}" style="color: #4f46e5; text-decoration: none;">Link</a>`;

    const calendarBtn = calendarLink ? `
        <div style="text-align: center; margin-top: 20px;">
            <a href="${calendarLink}" style="color: #6366f1; font-weight: 500; font-size: 14px; text-decoration: none; border: 1px solid #e0e7ff; padding: 8px 16px; border-radius: 20px;">📅 Update Google Calendar</a>
        </div>
    ` : '';

    const html = getBaseTemplate("Appointment Rescheduled", details, undefined, calendarBtn);

    try {
        await sendEmail({ to, subject, html, text: `Appointment Rescheduled to ${date} at ${time}.` });
        logger.info(`Reschedule email sent to ${to}`);
    } catch (error) {
        logger.error(`Failed to send reschedule email to ${to}`, error);
    }
};

export const sendAppointmentRejection = async ({
    to,
    subject,
    clientName,
    coachName,
    date,
    time
}: AppointmentEmailProps) => {

    const details = {
        'Coach': coachName,
        'Client': clientName,
        'Date': date,
        'Time': time,
        'Status': 'Rejected'
    };

    const html = getBaseTemplate("Appointment Declined", details, { text: "Book Another Time", url: "https://your-platform-url.com" }); // Replace with actual URL

    try {
        await sendEmail({ to, subject, html, text: `Appointment Rejected.` });
        logger.info(`Rejection email sent to ${to}`);
    } catch (error) {
        logger.error(`Failed to send rejection email to ${to}`, error);
    }
};

interface RecurringSessionEntry {
    date: string;
    time: string;
    calendarLink: string;
}


export const sendRecurringAppointmentSummary = async ({
    to,
    subject,
    clientName,
    coachName,
    platform,
    meetingLink,
    sessions
}: {
    to: string;
    subject: string;
    clientName: string;
    coachName: string;
    platform?: string;
    meetingLink: string;
    sessions: RecurringSessionEntry[];
}) => {

    const details: Record<string, string> = {
        'Coach': coachName,
        'Client': clientName,
        'Platform': platform || 'Dyte'
    };

    if (meetingLink) {
        details['Join Link'] = `<a href="${meetingLink}" style="color: #4f46e5; text-decoration: none;">Link</a>`;
    }

    // Build session rows
    const sessionRows = sessions.map(session => `
        <tr>
            <td style="padding: 10px 6px; font-weight: 500;">${session.date}</td>
            <td style="padding: 10px 6px;">${session.time}</td>
            <td style="padding: 10px 6px;">
                <a href="${session.calendarLink}"
                   style="color: #6366f1; font-weight: 500; text-decoration: none; border: 1px solid #e0e7ff; padding: 6px 14px; border-radius: 20px;">
                   📅 Add to Calendar
                </a>
            </td>
        </tr>
    `).join('');

    const extraHtml = `
        <div style="margin-top: 20px;">
            <h3 style="margin-bottom: 10px;">📅 Scheduled Sessions</h3>

            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <th align="left" style="padding-bottom: 8px;">Date</th>
                        <th align="left" style="padding-bottom: 8px;">Time</th>
                        <th align="left" style="padding-bottom: 8px;">Calendar</th>
                    </tr>
                </thead>
                <tbody>
                    ${sessionRows}
                </tbody>
            </table>

            <div style="background-color: #fffbeb; color: #b45309; padding: 14px; border-radius: 8px; font-size: 14px; text-align: center; margin-top: 20px; border: 1px solid #fcd34d;">
                <strong>Note:</strong> These appointments are <strong>PENDING approval</strong>. You will be notified once confirmed.
            </div>
        </div>
    `;

    const html = getBaseTemplate(
        "Recurring Appointments Scheduled",
        details,
        undefined,
        extraHtml
    );

    try {
        await sendEmail({
            to,
            subject,
            html,
            text: "Your recurring coaching sessions have been scheduled."
        });
        logger.info(`Recurring appointment summary email sent to ${to}`);
    } catch (error) {
        logger.error(`Failed to send recurring summary email to ${to}`, error);
    }
};

