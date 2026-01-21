import { Response } from "express";

export const successResponse = (res: Response, statusCode: number, message: string, data: any = null) => {
    return res.status(statusCode).json({
        status: true,
        statusCode,
        message,
        data,
    });
};

export const errorResponse = (res: Response, statusCode: number, message: string) => {
    return res.status(statusCode).json({
        status: false,
        statusCode,
        message,
    });
};
