import {
    GoogleGenerativeAI   
} from "@google/generative-ai";
import { env } from "../config/env";
 
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

export const generateContent = async (prompt: string): Promise<string> => {

    try {
        const result = await model.generateContent(prompt);
        const response = result.response
        return response.text()
    } catch (error) {
        console.error('Gemini error:', error)
        throw error
    }
}