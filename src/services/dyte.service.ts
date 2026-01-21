// src/service/dyte.service.ts
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const DYTE_API_URL = process.env.DYTE_API_URL || 'https://api.dyte.io/v2';
const DYTE_API_KEY = process.env.DYTE_API_KEY!;
const DYTE_ORG_ID = process.env.DYTE_ORG_ID!;

const authHeader = `Basic ${Buffer.from(`${DYTE_ORG_ID}:${DYTE_API_KEY}`).toString('base64')}`;
const defaultHeaders = {
    'Content-Type': 'application/json',
    Authorization: authHeader
};

export const createMeeting = async (title: string) => {
    console.log('[dyte] creating meeting title=', title);
    const res = await axios.post(`${DYTE_API_URL}/meetings`, { title }, { headers: defaultHeaders });
    console.log('[dyte] create meeting status=', res.status);
    return res.data.data;
};

export const addParticipant = async (meetingId: string, name: string, role: 'host' | 'participant', uniqueId: string) => {
    const payload = {
        name,
        preset_name: role === 'host' ? 'group_call_host' : 'group_call_participant',
        custom_participant_id: uniqueId
    };
    const res = await axios.post(`${DYTE_API_URL}/meetings/${meetingId}/participants`, payload, {
        headers: defaultHeaders
    });
    return res.data.data;
};

export const deleteDyteMeeting = async (meetingId: string) => {
    try {
        await axios.delete(`${DYTE_API_URL}/meetings/${meetingId}`, { headers: defaultHeaders });
    } catch (err: any) {
        console.warn('[dyte] delete error:', err.response?.data || err.message);
    }
};

export const getMeetingSessions = async (meetingId: string) => {
    try {
        console.log('[dyte] fetching sessions for meeting', meetingId);
        // GET /meetings/{meetingId}/sessions (Wait, Dyte API v2 uses /sessions?meeting_id=... or /meetings/{id}/active-session)
        // Correct endpoint for past sessions: GET /sessions?meeting_id={meetingId}
        const res = await axios.get(`${DYTE_API_URL}/sessions?meeting_id=${meetingId}`, { headers: defaultHeaders });
        return res.data.data;
    } catch (err: any) {
        console.warn('[dyte] get sessions error:', err.response?.data || err.message);
        return [];
    }
};
