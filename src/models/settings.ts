export interface Settings {
    id: string;
    first_meeting_duration?: string | null;
    created_at: Date;
    updated_at: Date;
}


export class SettingsModel implements Settings {
    id!: string;
    first_meeting_duration?: string | null;
    created_at!: Date;
    updated_at!: Date;

    constructor(data: Settings) {
        Object.assign(this, data);
    }
}