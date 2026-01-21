import { Request, Response } from "express";
import prisma from "../config/prisma";
import logger from "../utils/logger";
import { successResponse, errorResponse } from "../utils/responseHandler";

const component = "Settings Controller";

async function save_Settings(req: Request, res: Response) {
    logger.info(`${component} - save_Settings called`);
    try {
        const { first_meeting_duration } = req.body;
        const settingsData = await prisma.settings.create({
            data: {
                first_meeting_duration
            }
        });
        return successResponse(res, 200, "Settings saved successfully", settingsData);
    } catch (error) {
        logger.error(`${component} - Error in save_Settings: ${error}`);
        return errorResponse(res, 500, "Internal Server Error");
    }
}

export default {
    save_Settings
}