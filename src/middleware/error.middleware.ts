import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
 statusCode: number

    constructor(message: string, statusCode: number) {
        super(message)

        this.statusCode = statusCode

        Error.captureStackTrace(this, this.constructor)
    }
}

export const errorhandler = (
    err: Error,
    req: Request,
    res: Response,
     next: NextFunction 
) => {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({ message: err.message })
        
        return
    }

    console.error('unexpected error:', err)
    res.status(500).json({message: 'Internal server error'})
}