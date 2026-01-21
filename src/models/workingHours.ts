export enum isDeletedEnum {
  ACTIVE = 0,
  INACTIVE = 1,
  DELETED = 2
}

// ---------------- Working Hours : Session  ----------------
export interface Session {
  sessionId: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  durationPerSession?: string | null;
  durationPerSlot?: string | null;
}

export class SessionModel implements Session {
  sessionId!: string;
  startTime!: string;
  endTime!: string;
  isAvailable!: boolean;
  durationPerSession?: string | null;
  durationPerSlot?: string | null;

  constructor(data: Session) {
    Object.assign(this, data);
  }
}

// ---------------- Working Hours : Day ----------------
export interface workingHours_of_Coach {
  day: string;
  isDeleted: isDeletedEnum;
  sessionCount: number;
  sessions: Session[];
}

export class workingHours_of_CoachModel implements workingHours_of_Coach {
  day!: string;
  isDeleted!: isDeletedEnum;
  sessionCount!: number;
  sessions!: Session[];

  constructor(data: workingHours_of_Coach) {
    Object.assign(this, data);
    this.isDeleted = isDeletedEnum.ACTIVE;
    this.sessions = data.sessions?.map((s) => new SessionModel(s)) || [];
  }
}

// ---------------- Working Hours : Root ----------------
export interface workingHours {
  id?: string;
  coachId: string;
  isDeleted: isDeletedEnum;
  workingHours_of_Coach: workingHours_of_Coach[];
  created_at: Date;
  updated_at: Date;
}

export class workingHoursModel implements workingHours {
  id?: string;
  coachId!: string;
  isDeleted!: isDeletedEnum;
  workingHours_of_Coach!: workingHours_of_Coach[];
  created_at!: Date;
  updated_at!: Date;

  constructor(data: workingHours) {
    Object.assign(this, data);
    this.workingHours_of_Coach =
      data.workingHours_of_Coach?.map((w) => new workingHours_of_CoachModel(w)) || [];
  }
}