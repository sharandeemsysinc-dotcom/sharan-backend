export enum AppointmentStatusEnum {
    SCHEDULED = 1,
    COMPLETED = 2,
    CANCELLED = 3,
    RESCHEDULED = 4,
    PENDING = 5,
    REJECTED = 6
}

export enum repeat_unit_Enum {
    Day = 1,
    Week = 2,
    BiWeek = 3,
    Month = 4,
    Year = 5
}

export interface IAppointment {
    id: string;
    series_id?: string;
    coach_id: string;
    client_id: string;
    start_date: Date;
    end_date: Date;
    start_time?: string;
    end_time?: string;
    scheduled_start: Date;
    scheduled_end: Date;
    duration_minutes: number;
    timezone: string;
    status: AppointmentStatusEnum;
    is_reschedule: number;
    meeting_link?: string | null;
    meeting_provider?: string | null;
    meeting_password?: string | null;
    payment_status?: string | null;
    price?: number | null;
    currency?: string | null;
    cancelled_by?: string | null;
    cancel_reason?: string | null;
    cancelled_at?: Date | null;
    coach_notes?: string | null;
    client_notes?: string | null;
    coach_rating?: number | null;
    reminder_sent_at?: Date | null;
    is_first_meeting?: Boolean;
    is_overlapped?: boolean;
    // --- Recurring Pattern Keys (Non-mandatory) ---
    no_of_sessions?: number;
    meeting_type?: string;           // "single" | "recurring"
    repeat_unit?: repeat_unit_Enum;
    repeat_interval?: string;       // e.g., "1"
    recurrence_days?: number[];     // [0,1,2,3,4,5,6]
    recurrence_start_date?: Date;
    recurrence_end_date?: Date;
    recurrence_pattern_type?: string; // "fixed" | "relative"
    fixed_day_of_month?: string;
    relative_week_index?: string;
    relative_day_of_week?: string;
    all_day?: boolean;
    payment_id?: string | null;
    created_at: Date;
    updated_at: Date;
}

export class AppointmentModel implements IAppointment {
    id!: string;
    series_id?: string;
    coach_id!: string;
    client_id!: string;
    start_date!: Date;
    end_date!: Date;
    start_time?: string;
    end_time?: string;
    scheduled_start!: Date;
    scheduled_end!: Date;
    duration_minutes!: number;
    timezone!: string;
    status!: AppointmentStatusEnum;
    is_reschedule!: number;
    meeting_link?: string | null;
    meeting_provider?: string | null;
    meeting_password?: string | null;
    payment_status?: string | null;
    price?: number | null;
    currency?: string | null;
    cancelled_by?: string | null;
    cancel_reason?: string | null;
    cancelled_at?: Date | null;
    coach_notes?: string | null;
    client_notes?: string | null;
    coach_rating?: number | null;
    reminder_sent_at?: Date | null;
    is_first_meeting!: Boolean;
    overlap?: boolean;
    // Implementation of optional recurring fields
    no_of_sessions?: number;
    meeting_type?: string;
    repeat_unit?: repeat_unit_Enum;
    repeat_interval?: string;
    recurrence_days?: number[];
    recurrence_start_date?: Date;
    recurrence_end_date?: Date;
    recurrence_pattern_type?: string;
    fixed_day_of_month?: string;
    relative_week_index?: string;
    relative_day_of_week?: string;
    all_day?: boolean;
    payment_id?: string | null;
    created_at!: Date;
    updated_at!: Date;

    constructor(data: any) {
        Object.assign(this, data);
        // Logic for extracting 12-hour format time strings (UTC version)
        if (data.scheduled_start) {
            const startDate = new Date(data.scheduled_start);
            this.start_time = this.formatTo12HourUTC(startDate);
        }
        if (data.scheduled_end) {
            const endDate = new Date(data.scheduled_end);
            this.end_time = this.formatTo12HourUTC(endDate);
        }
        // Decimal to Number conversion for Prisma
        if (data.price && typeof data.price === 'object' && 'toNumber' in data.price) {
            this.price = data.price.toNumber();
        }
        if (data.coach_rating && typeof data.coach_rating === 'object' && 'toNumber' in data.coach_rating) {
            this.coach_rating = data.coach_rating.toNumber();
        }
    }

    formatTo12HourUTC(date: Date): string {
        let hours = date.getUTCHours(); // Use UTC
        const minutes = date.getUTCMinutes(); // Use UTC
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        const strMinutes = minutes < 10 ? '0' + minutes : minutes;
        return `${hours}:${strMinutes} ${ampm}`;
    }
}