import httpx
from app.core.config import settings

class AIService:
    @staticmethod
    async def generate_reply(conversation_text: str, custom_instruction: str = None) -> str:
        prompt = """You are an intelligent email assistant.

Generate a natural email reply to the latest message in the conversation.

Rules:
1. Use only information present in the email conversation.
2. Do not invent facts.
3. Do not invent commitments, dates, prices, policies or information.
4. Maintain the context of the conversation.
5. Answer the sender's request directly.
6. Keep the response professional and natural.
7. Do not mention that AI generated the response.
8. Do not include a subject line.
9. Do not include email headers.
10. Return only the reply body.
"""
        if custom_instruction:
            prompt += f"\nAdditional instruction: {custom_instruction}\n"
            
        prompt += f"\nConversation:\n{conversation_text}\n\nReply:"
        
        async with httpx.AsyncClient(timeout=settings.ollama_timeout) as client:
            try:
                response = await client.post(
                    f"{settings.ollama_base_url}/api/generate",
                    json={
                        "model": settings.ollama_model,
                        "prompt": prompt,
                        "stream": False
                    }
                )
                response.raise_for_status()
                result = response.json()
                return result.get("response", "").strip()
            except Exception as e:
                raise Exception(f"Failed to generate response with Ollama: {str(e)}")
