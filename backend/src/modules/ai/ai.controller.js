const Groq = require("groq-sdk");
const Replicate = require("replicate");
const axios = require("axios");

const AI_UNAVAILABLE_MESSAGE =
    "AI generation is currently unavailable. Please check the AI service configuration.";

const getGroqClient = (res, logTag) => {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey || apiKey === "PASTE_YOUR_GROQ_API_KEY_HERE") {
        console.error(`[${logTag}] GROQ_API_KEY is not configured in .env`);
        res.status(503).json({ success: false, message: AI_UNAVAILABLE_MESSAGE });
        return null;
    }
    return new Groq({ apiKey });
};

const handleGroqError = (res, logTag, error) => {
    const isAuthError =
        error?.status === 401 ||
        error?.error?.code === "invalid_api_key" ||
        String(error?.message || "").includes("Invalid API Key");

    if (isAuthError) {
        console.error(`[${logTag}] Groq authentication failed (401 Invalid API Key). Verify GROQ_API_KEY in backend/.env.`);
        return res.status(503).json({ success: false, message: AI_UNAVAILABLE_MESSAGE });
    }

    console.error(`[${logTag}] Groq AI Error:`, error.message);
    return res.status(500).json({ success: false, message: error.message || AI_UNAVAILABLE_MESSAGE });
};

/**
 * AI Controller for Category Narratives - Powered by Groq (LLaMA)
 */
const generateCategoryDescription = async (req, res, next) => {
    try {
        const { name } = req.query;
        console.log(`[AI-CAT] Request received for: "${name}"`);

        if (!name) {
            console.error("[AI-CAT] Missing name in query");
            return res.status(400).json({ success: false, message: "Name is required" });
        }

        const groq = getGroqClient(res, "AI-CAT");
        if (!groq) return;

        const prompt = `Write a professional 2-4 word sophisticated category description for "${name}". Sound premium and luxurious. Respond ONLY with the description text itself.`;

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a professional e-commerce copywriter. Only output the raw description text.",
                },
                { role: "user", content: prompt },
            ],
            model: "llama-3.1-8b-instant",
            max_tokens: 50,
            temperature: 0.7,
        });

        const text = completion.choices[0]?.message?.content?.trim();
        res.status(200).json({ success: true, data: { description: text } });
    } catch (error) {
        handleGroqError(res, "AI-CAT", error);
    }
};

/**
 * AI Controller for Product Narratives - Powered by Groq (LLaMA)
 */
const generateProductDescription = async (req, res, next) => {
    try {
        const { name } = req.query;
        console.log(`[AI-PROD] Request received for: "${name}"`);

        if (!name) {
            console.error("[AI-PROD] Missing name in query");
            return res.status(400).json({ success: false, message: "Product name is required" });
        }

        const groq = getGroqClient(res, "AI-PROD");
        if (!groq) return;

        const prompt = `Write a creative, vibrant, and highly promotional e-commerce product description for "${name}". 
        CRITICAL: Length MUST be between 10 to 20 words. 
        TONE: Premium, stylish, and innovative.
        Respond ONLY with the description text itself.`;

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a professional e-commerce copywriter. Follow word count instructions strictly (10-20 words). Never use introductory phrases like 'Here is your description'. Only output the raw description text.",
                },
                { role: "user", content: prompt },
            ],
            model: "llama-3.1-8b-instant",
            max_tokens: 150,
            temperature: 0.8,
        });

        const text = completion.choices[0]?.message?.content?.trim();
        res.status(200).json({ success: true, data: { description: text } });
    } catch (error) {
        handleGroqError(res, "AI-PROD", error);
    }
};

/**
 * AI Image Generation - Powered by Replicate (flux-schnell model)
 */
const generateCategoryImage = async (req, res) => {
    try {
        const { name } = req.query;
        if (!name) {
            return res.status(400).json({ success: false, message: "Category name is required" });
        }

        const token = process.env.REPLICATE_API_TOKEN;
        if (!token || token === "PASTE_YOUR_REPLICATE_API_TOKEN_HERE") {
            return res.status(500).json({
                success: false,
                message: "REPLICATE_API_TOKEN is not configured. Get a free token at replicate.com",
            });
        }

        const replicate = new Replicate({ auth: token });

        const prompt = `professional e-commerce product category banner for "${name}", clean white studio background, high quality commercial photography, minimalist, 4k`;

        console.log(`[ImageGen] Running Replicate flux-schnell for: "${name}"`);

        const output = await replicate.run(
            "black-forest-labs/flux-schnell",
            {
                input: {
                    prompt,
                    num_outputs: 1,
                    aspect_ratio: "16:9",
                    output_format: "webp",
                    output_quality: 90,
                },
            }
        );

        let imageUrl = Array.isArray(output) ? output[0] : output;

        if (imageUrl && typeof imageUrl === "object" && typeof imageUrl.url === "function") {
            imageUrl = imageUrl.url().href;
        } else if (imageUrl && typeof imageUrl === "object") {
            imageUrl = String(imageUrl);
        }

        console.log(`[ImageGen] Replicate output URL: ${imageUrl}`);

        const imgResponse = await axios.get(imageUrl, {
            responseType: "arraybuffer",
            timeout: 30000,
        });

        const contentType = imgResponse.headers["content-type"] || "image/webp";
        const base64 = Buffer.from(imgResponse.data).toString("base64");
        const dataUrl = `data:${contentType};base64,${base64}`;

        res.status(200).json({
            success: true,
            data: { imageUrl: dataUrl },
        });
    } catch (error) {
        console.error("[ImageGen] Replicate Error:", error.message);
        res.status(500).json({
            success: false,
            message: `Image generation failed: ${error.message}`,
        });
    }
};

module.exports = { 
    generateCategoryDescription, 
    generateProductDescription,
    generateCategoryImage 
};
