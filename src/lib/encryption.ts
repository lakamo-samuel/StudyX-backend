import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm'
const KEY = crypto.scryptSync(env.JWT_SECRET || 'fallback', 'salt', 32)

export const encrypt = (text: string): string => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
    const encrypted = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()])
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}
export const decrypt = (encryptText: string): string => {
    const [ivHex, tagHex, encryptedHex] = encryptText.split(":");
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, "hex")
    const encrypted = Buffer.from(encryptedHex, 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
    decipher.setAuthTag(tag)
    return decipher.update(encrypted) + decipher.final('utf-8')
}


