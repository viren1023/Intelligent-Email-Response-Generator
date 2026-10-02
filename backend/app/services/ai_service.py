import httpx
import json
from typing import AsyncGenerator, List, Dict, Any, Optional
from app.core.config import settings

TONE_PROMPTS = {
    "professional": "Maintain a polished, polite, and standard business tone.",
    "friendly": "Use a warm, cordial, approachable, and encouraging tone.",
    "concise": "Keep the reply extremely brief, direct, and under 3-4 sentences.",
    "formal": "Use an elevated, structured, and strictly formal corporate tone.",
}

class AIService:
    @staticmethod
    def _build_prompt(conversation_text: str, custom_instruction: Optional[str] = None, tone: Optional[str] = "professional") -> str:
        tone_instruction = TONE_PROMPTS.get(tone.lower() if tone else "professional", "")
        if tone and tone.lower() not in TONE_PROMPTS and tone.strip():
            tone_instruction = f"Tone requirement: {tone.strip()}."

        prompt = f"""You are an intelligent email assistant.

Generate a natural email reply to the latest message in the conversation.

Tone: {tone_instruction}

Rules:
1. Use only information present in the email conversation.
2. Do not invent facts.
3. Do not invent commitments, dates, prices, policies or information.
4. Maintain the context of the conversation.
5. Answer the sender's request directly.
6. Do not mention that AI generated the response.
7. Do not include a subject line.
8. Do not include email headers.
9. Return only the reply body.
"""
        if custom_instruction:
            prompt += f"\nAdditional instruction: {custom_instruction}\n"
            
        prompt += f"\nConversation:\n{conversation_text}\n\nReply:"
        return prompt

    @staticmethod
    async def generate_reply(conversation_text: str, custom_instruction: str = None, tone: str = "professional", model_name: Optional[str] = None) -> str:
        prompt = AIService._build_prompt(conversation_text, custom_instruction, tone)
        target_model = model_name or settings.ollama_model

        async with httpx.AsyncClient(timeout=settings.ollama_timeout) as client:
            try:
                response = await client.post(
                    f"{settings.ollama_base_url}/api/generate",
                    json={
                        "model": target_model,
                        "prompt": prompt,
                        "stream": False
                    }
                )
                response.raise_for_status()
                result = response.json()
                return result.get("response", "").strip()
            except Exception as e:
                raise Exception(f"Failed to generate response with Ollama: {str(e)}")

    @staticmethod
    async def generate_reply_stream(conversation_text: str, custom_instruction: Optional[str] = None, tone: Optional[str] = "professional", model_name: Optional[str] = None) -> AsyncGenerator[str, None]:
        prompt = AIService._build_prompt(conversation_text, custom_instruction, tone)
        target_model = model_name or settings.ollama_model

        async with httpx.AsyncClient(timeout=settings.ollama_timeout) as client:
            try:
                async with client.stream(
                    "POST",
                    f"{settings.ollama_base_url}/api/generate",
                    json={
                        "model": target_model,
                        "prompt": prompt,
                        "stream": True
                    }
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            token = data.get("response", "")
                            if token:
                                yield token
                            if data.get("done", False):
                                break
                        except Exception:
                            continue
            except Exception as e:
                yield f"\n[Error generating stream: {str(e)}]"

    @staticmethod
    async def generate_quick_replies(conversation_text: str, model_name: Optional[str] = None) -> List[str]:
        prompt = f"""You are an email assistant.
Based on this email conversation, suggest exactly 3 short, helpful quick-reply options that the recipient could send.
Each option must be concise (2 to 8 words).

Conversation:
{conversation_text}

Output format:
Return ONLY a valid JSON array of 3 strings. Example: ["Sounds good to me!", "Let's schedule a call.", "Could you share more details?"]
"""
        target_model = model_name or settings.ollama_model
        async with httpx.AsyncClient(timeout=40) as client:
            try:
                response = await client.post(
                    f"{settings.ollama_base_url}/api/generate",
                    json={
                        "model": target_model,
                        "prompt": prompt,
                        "stream": False,
                        "format": "json"
                    }
                )
                response.raise_for_status()
                raw_text = response.json().get("response", "").strip()
                data = json.loads(raw_text)
                if isinstance(data, list) and len(data) > 0:
                    return [str(item) for item in data[:3]]
                elif isinstance(data, dict):
                    # In case model wrapped in a key
                    for val in data.values():
                        if isinstance(val, list):
                            return [str(item) for item in val[:3]]
            except Exception:
                pass
            return ["Sounds good!", "Let's schedule a quick call.", "Could you provide more details?"]

    @staticmethod
    async def classify_urgency(subject: str, snippet: str, model_name: Optional[str] = None) -> str:
        prompt = f"""Classify the urgency of the following email into one of these three exact labels:
- URGENT (immediate action/crisis/deadline today)
- IMPORTANT (action required, standard priority)
- NORMAL (informational, newsletters, low priority)

Subject: {subject}
Snippet: {snippet}

Reply with ONLY ONE WORD from: URGENT, IMPORTANT, NORMAL.
"""
        target_model = model_name or settings.ollama_model
        async with httpx.AsyncClient(timeout=20) as client:
            try:
                response = await client.post(
                    f"{settings.ollama_base_url}/api/generate",
                    json={
                        "model": target_model,
                        "prompt": prompt,
                        "stream": False
                    }
                )
                response.raise_for_status()
                label = response.json().get("response", "").strip().upper()
                if "URGENT" in label:
                    return "URGENT"
                elif "IMPORTANT" in label:
                    return "IMPORTANT"
                return "NORMAL"
            except Exception:
                return "NORMAL"

    @staticmethod
    async def chat_stream(email_context: str, messages: List[Dict[str, str]], model_name: Optional[str] = None) -> AsyncGenerator[str, None]:
        system_instruction = f"""You are an intelligent email assistant. You are helping the user with the following email conversation:

=== EMAIL CONTEXT ===
{email_context}
=====================

Answer the user's questions, summarize key points, or draft customized replies based on this context. Be helpful, concise, and direct."""

        formatted_prompt = f"System: {system_instruction}\n\n"
        for m in messages:
            role = "User" if m.get("role") == "user" else "Assistant"
            formatted_prompt += f"{role}: {m.get('content', '')}\n"
        formatted_prompt += "Assistant: "

        target_model = model_name or settings.ollama_model

        async with httpx.AsyncClient(timeout=settings.ollama_timeout) as client:
            try:
                async with client.stream(
                    "POST",
                    f"{settings.ollama_base_url}/api/generate",
                    json={
                        "model": target_model,
                        "prompt": formatted_prompt,
                        "stream": True
                    }
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            token = data.get("response", "")
                            if token:
                                yield token
                            if data.get("done", False):
                                break
                        except Exception:
                            continue
            except Exception as e:
                yield f"\n[Error: {str(e)}]"
