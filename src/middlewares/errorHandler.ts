import { Request, Response, NextFunction } from "express";

const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Error:", err.message);
    res.status(500).json({ message: "Something went wrong", error: err.message });
};

export default errorHandler;
