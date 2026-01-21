// src/models/User.ts
export interface IUser {
  id: string;
  email: string;
  user_name: string;
  phone?: string;
  is_active: boolean;
  is_email_verified: boolean;
  last_login_at?: Date;
  role_id: number;
  role?: string;
  refresh_token?: string;
  otp_code_hash?: String;
  otp_attempts?: number;
  otp_expires_at?: Date;

  status?: number;
  created_at: Date;
  updated_at: Date;
}

export class User implements IUser {
  id!: string;
  email!: string;
  user_name!: string;
  phone?: string;
  is_active!: boolean;
  is_email_verified!: boolean;
  last_login_at?: Date;
  role_id!: number;
  role?: string;
  refresh_token?: string;
  otp_code_hash?: String;
  otp_attempts?: number;
  otp_expires_at?: Date;
  status!: number;
  created_at!: Date;
  updated_at!: Date;

  constructor(data: IUser) {
    Object.assign(this, data);
  }

}

export interface CreateUserInput {
  email: string;
  password: string;
  user_name: string;
  phone?: string;
  role_id: number;
  role?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}
