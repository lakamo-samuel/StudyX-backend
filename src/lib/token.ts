import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { SignOptions } from "jsonwebtoken";
interface TokenPayload {
  userId: string;
  email: string;
}

export const signToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, env.JWT_SECRET as string, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_SECRET as string) as TokenPayload;
};
