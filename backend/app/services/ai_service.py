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
    def _build_prompt(conversation_text: str, custom_instruction: Optional[str] = None, tone: Optional[str] = "professional", user_name: str = "", user_email: str = "") -> str:
        tone_instruction = TONE_PROMPTS.get(tone.lower() if tone else "professional", "")
        if tone and tone.lower() not in TONE_PROMPTS and tone.strip():
            tone_instruction = f"Tone requirement: {tone.strip()}."

        prompt = f"""You are {user_name} ({user_email}).

Generate a natural email reply to the latest message in the conversation. Write the email directly from your own personal first-person perspective as {user_name}. Use "I", "me", "my", and sign off with your name ({user_name}).

Tone: {tone_instruction}

Rules:
1. STRICT FIRST-PERSON PERSPECTIVE: You are {user_name}. Never refer to {user_name} in the third person. For example, never say "{user_name} is currently busy with..." or "{user_name} will follow up"; instead always say "I am currently busy with..." or "I will follow up".
2. Use only information present in the email conversation.
3. Do not invent facts.
4. Do not invent commitments, dates, prices, policies or information.
5. Maintain the context of the conversation.
6. Answer the sender's request directly.
7. Do not mention that AI generated the response.
8. Do not include a subject line.
9. Do not include email headers.
10. Return only the reply body.
"""
        if custom_instruction:
            prompt += f"\nAdditional instruction: {custom_instruction}\n"
            
        prompt += f"\nConversation:\n{conversation_text}\n\nReply:"
        return prompt

    @staticmethod
    def _sanitize_gemini_model(model_name: Optional[str]) -> str:
        if not model_name or not model_name.startswith("gemini-1."):
            return "gemini-1.5-flash"
        return model_name.strip()

    @staticmethod
    async def _call_gemini_api(prompt: str, primary_model: Optional[str] = None) -> str:
        sanitized = AIService._sanitize_gemini_model(primary_model)
        models_to_try = [sanitized, "gemini-1.5-flash", "gemini-1.5-pro"]
        candidate_models = []
        for m in models_to_try:
            if m and m not in candidate_models:
                candidate_models.append(m)

        last_error = ""
        async with httpx.AsyncClient(timeout=60) as client:
            for model in candidate_models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={settings.gemini_api_key}"
                try:
                    res = await client.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
                    if res.status_code == 200:
                        data = res.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            if parts:
                                return parts[0].get("text", "").strip()
                    last_error = f"Model '{model}' returned HTTP {res.status_code}: {res.text[:150]}"
                except Exception as ex:
                    last_error = str(ex)

        raise Exception(f"Gemini API Error: {last_error}")

    @staticmethod
    async def generate_compose_email(
        prompt_text: str,
        recipient: Optional[str] = None,
        subject: Optional[str] = None,
        tone: Optional[str] = "professional",
        user_name: str = "",
        user_email: str = "",
        model_name: Optional[str] = None,
        provider: Optional[str] = None
    ) -> str:
        tone_instruction = TONE_PROMPTS.get(tone.lower() if tone else "professional", "")
        if tone and tone.lower() not in TONE_PROMPTS and tone.strip():
            tone_instruction = f"Tone requirement: {tone.strip()}."

        full_prompt = f"""You are {user_name} ({user_email}).
Write a complete, high-quality email body to be sent to a recipient.

Context / Request: {prompt_text}
Recipient: {recipient or 'Not specified'}
Subject: {subject or 'Not specified'}
Tone: {tone_instruction}

Rules:
1. Write directly as {user_name}. Use "I" and sign off with your name.
2. Do not include email headers (To:, From:, Subject:).
3. Do not include markdown meta commentary or explanation.
4. Return ONLY the email body text.
"""
        prov = provider or settings.active_provider
        if prov == "gemini" and settings.gemini_api_key:
            return await AIService._call_gemini_api(full_prompt, model_name)

        target_model = model_name or settings.ollama_model
        async with httpx.AsyncClient(timeout=settings.ollama_timeout) as client:
            try:
                response = await client.post(
                    f"{settings.ollama_base_url}/api/generate",
                    json={
                        "model": target_model,
                        "prompt": full_prompt,
                        "stream": False
                    }
                )
                if response.status_code == 404:
                    raise Exception(f"Model '{target_model}' not found in Ollama.")
                response.raise_for_status()
                result = response.json()
                return result.get("response", "").strip()
            except Exception as e:
                raise Exception(f"Ollama Error: {str(e)}")

    @staticmethod
    async def generate_compose_chat(
        prompt_text: str,
        current_subject: Optional[str] = "",
        current_body: Optional[str] = "",
        recipient: Optional[str] = None,
        tone: Optional[str] = "professional",
        chat_history: Optional[List[Dict[str, str]]] = None,
        image_names: Optional[List[str]] = None,
        user_name: str = "",
        user_email: str = "",
        model_name: Optional[str] = None,
        provider: Optional[str] = None
    ) -> Dict[str, str]:
        import json, re

        tone_instruction = TONE_PROMPTS.get(tone.lower() if tone else "professional", "")
        if tone and tone.lower() not in TONE_PROMPTS and tone.strip():
            tone_instruction = f"Tone requirement: {tone.strip()}."

        history_context = ""
        if chat_history and len(chat_history) > 0:
            history_lines = []
            for msg in chat_history[-6:]:
                role = "User" if msg.get("role") == "user" else "Assistant"
                history_lines.append(f"{role}: {msg.get('content', '')}")
            history_context = "Recent Iterative Conversation:\n" + "\n".join(history_lines) + "\n\n"

        image_context = ""
        if image_names and len(image_names) > 0:
            image_context = f"Attachments/Images present in draft: {', '.join(image_names)}.\n(Note: If visual inspection is not supported by this model, acknowledge the files in your reply and continue fulfilling the drafting/refining request seamlessly).\n"

        full_prompt = f"""You are an expert AI email copilot assisting {user_name} ({user_email}).
The user is iteratively creating and refining an email.

{history_context}Current Context:
Recipient: {recipient or 'Not specified'}
Current Subject: {current_subject or '(empty)'}
Current Body: {current_body or '(empty)'}
Tone: {tone_instruction}
{image_context}
User Prompt: {prompt_text}

Instructions:
1. If this is a new email request, generate an appropriate Subject line and complete Body text.
2. If the user asks to modify the subject (e.g. 'make the subject concise', 'change subject to X'), update the subject while keeping the body intact or appropriately aligned.
3. If the user asks to modify the body (e.g. 'add a follow-up deadline', 'make it friendlier'), update the body text while preserving or adjusting the subject.
4. Output your response as valid JSON with keys:
   - "subject": (string) The full updated subject line.
   - "body": (string) The full updated email body (sign off as {user_name}).
   - "reply": (string) A concise 1-2 sentence assistant chat message explaining what was updated or noting any file/attachment context.

Return ONLY the raw JSON object. Do not wrap in markdown or code blocks.
"""
        prov = provider or settings.active_provider
        raw_output = ""
        if prov == "gemini" and settings.gemini_api_key:
            raw_output = await AIService._call_gemini_api(full_prompt, model_name)
        else:
            target_model = model_name or settings.ollama_model
            async with httpx.AsyncClient(timeout=settings.ollama_timeout) as client:
                try:
                    response = await client.post(
                        f"{settings.ollama_base_url}/api/generate",
                        json={
                            "model": target_model,
                            "prompt": full_prompt,
                            "stream": False
                        }
                    )
                    if response.status_code == 404:
                        raise Exception(f"Model '{target_model}' not found in Ollama.")
                    response.raise_for_status()
                    raw_output = response.json().get("response", "").strip()
                except Exception as e:
                    raise Exception(f"Ollama Error: {str(e)}")

        # Robust JSON cleaning and parsing
        cleaned = raw_output.strip()
        if "```json" in cleaned:
            cleaned = cleaned.split("```json")[1].split("```")[0].strip()
        elif "```" in cleaned:
            cleaned = cleaned.split("```")[1].split("```")[0].strip()

        try:
            parsed = json.loads(cleaned)
            return {
                "subject": parsed.get("subject") or current_subject or "Draft Subject",
                "body": parsed.get("body") or raw_output,
                "reply": parsed.get("reply") or "Updated the email draft based on your instruction."
            }
        except Exception:
            # Fallback regex extraction if raw JSON parsing fails
            subj_match = re.search(r'"subject"\s*:\s*"([^"]+)"', raw_output)
            body_match = re.search(r'"body"\s*:\s*"([^"]+)"', raw_output)
            reply_match = re.search(r'"reply"\s*:\s*"([^"]+)"', raw_output)
            subj = subj_match.group(1) if subj_match else (current_subject or "Draft Subject")
            body = body_match.group(1).replace("\\n", "\n") if body_match else raw_output
            reply = reply_match.group(1) if reply_match else "Updated the email draft."
            return {"subject": subj, "body": body, "reply": reply}

    @staticmethod
    async def generate_reply(
        conversation_text: str, 
        custom_instruction: str = None, 
        tone: str = "professional", 
        user_name: str = "",
        user_email: str = "",
        model_name: Optional[str] = None,
        provider: Optional[str] = None
    ) -> str:
        prompt = AIService._build_prompt(conversation_text, custom_instruction, tone, user_name, user_email)
        prov = provider or settings.active_provider
        
        if prov == "gemini" and settings.gemini_api_key:
            return await AIService._call_gemini_api(prompt, model_name)

        # Default Ollama
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
                if response.status_code == 404:
                    raise Exception(f"Model '{target_model}' not found in Ollama. Please run 'ollama pull {target_model}' in your terminal or configure Gemini in Settings.")
                response.raise_for_status()
                result = response.json()
                return result.get("response", "").strip()
            except Exception as e:
                raise Exception(f"Ollama Error: {str(e)}")

    @staticmethod
    async def generate_reply_stream(
        conversation_text: str, 
        custom_instruction: Optional[str] = None, 
        tone: Optional[str] = "professional", 
        user_name: str = "",
        user_email: str = "",
        model_name: Optional[str] = None,
        provider: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        prompt = AIService._build_prompt(conversation_text, custom_instruction, tone, user_name, user_email)
        prov = provider or settings.active_provider

        if prov == "gemini" and settings.gemini_api_key:
            target_model = AIService._sanitize_gemini_model(model_name)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:streamGenerateContent?alt=sse&key={settings.gemini_api_key}"
            async with httpx.AsyncClient(timeout=60) as client:
                try:
                    async with client.stream("POST", url, json={"contents": [{"parts": [{"text": prompt}]}]}) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            if line.startswith("data: "):
                                try:
                                    parsed = json.loads(line[6:])
                                    candidates = parsed.get("candidates", [])
                                    if candidates:
                                        parts = candidates[0].get("content", {}).get("parts", [])
                                        for part in parts:
                                            txt = part.get("text", "")
                                            if txt:
                                                yield txt
                                except Exception:
                                    pass
                    return
                except (httpx.HTTPError, ConnectionResetError, OSError) as e:
                    yield f"\n[Network/Stream Error: Connection reset or unavailable - {str(e)}]"
                    return
                except Exception as e:
                    yield f"\n[Gemini Error: {str(e)}]"
                    return

        # Ollama stream
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
                    if response.status_code == 404:
                        yield f"\n[Ollama Error 404: Model '{target_model}' not found. Please run 'ollama pull {target_model}' or use Gemini in Settings.]"
                        return
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

    @staticmethod
    def _parse_json_list(raw_text: str) -> List[str]:
        if not raw_text:
            return []
        cleaned = raw_text.replace("```json", "").replace("```", "").strip()
        try:
            data = json.loads(cleaned)
            if isinstance(data, list) and len(data) > 0:
                return [str(item).strip() for item in data if str(item).strip()]
            if isinstance(data, dict):
                for val in data.values():
                    if isinstance(val, list) and len(val) > 0:
                        return [str(item).strip() for item in val if str(item).strip()]
        except Exception:
            pass

        import re
        matches = re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', cleaned)
        if matches and len(matches) >= 2:
            return [m.strip() for m in matches if m.strip() and len(m.strip()) > 3]

        lines = [l.strip().lstrip("-*123456789. ") for l in cleaned.split("\n") if l.strip()]
        return [l for l in lines if len(l) > 3]

    @staticmethod
    async def generate_quick_replies(
        conversation_text: str, 
        user_name: str = "User",
        model_name: Optional[str] = None,
        provider: Optional[str] = None
    ) -> List[str]:
        prompt = f"""You are an email assistant for {user_name}.
Based on this email conversation, suggest exactly 3 short, personalized quick-reply options that {user_name} could send back to the sender.
Each option must be 2 to 8 words long, polite, and directly address the specific topic, questions, or action items in the conversation.

Conversation:
{conversation_text}

Output format:
Return ONLY a valid JSON array of 3 strings. Example: ["Yes, Tuesday works for me!", "I'll review the draft and follow up.", "Could you share the updated budget?"]
"""
        prov = provider or settings.active_provider
        if prov == "gemini" and settings.gemini_api_key:
            target_model = AIService._sanitize_gemini_model(model_name)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={settings.gemini_api_key}"
            async with httpx.AsyncClient(timeout=15) as client:
                try:
                    res = await client.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
                    if res.status_code == 200:
                        raw_text = res.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                        items = AIService._parse_json_list(raw_text)
                        if items:
                            return items[:3]
                except Exception:
                    pass

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
                if response.status_code == 200:
                    raw_text = response.json().get("response", "").strip()
                    items = AIService._parse_json_list(raw_text)
                    if items:
                        return items[:3]
            except Exception:
                pass

        return ["Thanks for reaching out!", "I will review this and follow up shortly.", "Could you provide additional details?"]

    @staticmethod
    async def generate_chat_prompts(
        conversation_text: str,
        user_name: str = "User",
        model_name: Optional[str] = None,
        provider: Optional[str] = None
    ) -> List[str]:
        prompt = f"""You are an intelligent email context analyst.
Based on the following email conversation, generate 3 specific, helpful quick prompt questions that the user ({user_name}) might want to ask about this thread.

Conversation:
{conversation_text}

Requirements:
- Make each prompt directly reference specific topics, names, dates, or requests mentioned in the thread.
- Return ONLY a JSON array of 3 strings. Example: ["Summarize John's feedback on the proposal.", "What deadlines were requested for this project?", "Draft a polite acceptance for the requested revisions."]
"""
        prov = provider or settings.active_provider
        if prov == "gemini" and settings.gemini_api_key:
            target_model = AIService._sanitize_gemini_model(model_name)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={settings.gemini_api_key}"
            async with httpx.AsyncClient(timeout=15) as client:
                try:
                    res = await client.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
                    if res.status_code == 200:
                        raw_text = res.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                        items = AIService._parse_json_list(raw_text)
                        if items:
                            return items[:3]
                except Exception:
                    pass

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
                if response.status_code == 200:
                    raw_text = response.json().get("response", "").strip()
                    items = AIService._parse_json_list(raw_text)
                    if items:
                        return items[:3]
            except Exception:
                pass

        return [
            "Summarize the key action items in this email thread.",
            "What specific questions or deadlines require my attention?",
            "Draft a detailed response addressing all open points."
        ]

    @staticmethod
    async def classify_urgency(subject: str, snippet: str, model_name: Optional[str] = None, provider: Optional[str] = None) -> str:
        prompt = f"""Classify the urgency of the following email into one of these three exact labels:
- URGENT (immediate action/crisis/deadline today)
- IMPORTANT (action required, standard priority)
- NORMAL (informational, newsletters, low priority)

Subject: {subject}
Snippet: {snippet}

Reply with ONLY ONE WORD from: URGENT, IMPORTANT, NORMAL.
"""
        prov = provider or settings.active_provider
        if prov == "gemini" and settings.gemini_api_key:
            target_model = AIService._sanitize_gemini_model(model_name)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={settings.gemini_api_key}"
            async with httpx.AsyncClient(timeout=10) as client:
                try:
                    res = await client.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
                    if res.status_code == 200:
                        label = res.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip().upper()
                        if "URGENT" in label: return "URGENT"
                        if "IMPORTANT" in label: return "IMPORTANT"
                        return "NORMAL"
                except Exception:
                    pass

        target_model = model_name or settings.ollama_model
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                response = await client.post(
                    f"{settings.ollama_base_url}/api/generate",
                    json={
                        "model": target_model,
                        "prompt": prompt,
                        "stream": False
                    }
                )
                if response.status_code == 200:
                    label = response.json().get("response", "").strip().upper()
                    if "URGENT" in label:
                        return "URGENT"
                    elif "IMPORTANT" in label:
                        return "IMPORTANT"
            except Exception:
                pass
        return "NORMAL"

    @staticmethod
    async def analyze_thread(
        conversation_text: str,
        user_name: str = "User",
        model_name: Optional[str] = None,
        provider: Optional[str] = None
    ) -> Dict[str, Any]:
        prompt = f"""You are an intelligent email copilot for {user_name}.
Analyze the following email thread:

{conversation_text}

Provide:
1. "summary": A concise 1-2 sentence overview of what the sender is communicating or requesting.
2. "sentiment": A brief 1-3 word tone/intent label (e.g. "Action Required", "Informational", "Partnership Inquiry", "Urgent Request").
3. "scenarios": A JSON array of exactly 2-3 specific reply action scenarios that {user_name} might choose to respond with.
4. "quick_chip": A short 3-6 word suggested action.

Respond ONLY with valid JSON in this exact structure without markdown ticks:
{{
  "summary": "...",
  "sentiment": "...",
  "scenarios": ["...", "..."],
  "quick_chip": "..."
}}
"""
        prov = provider or settings.active_provider
        if prov == "gemini" and settings.gemini_api_key:
            target_model = AIService._sanitize_gemini_model(model_name)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={settings.gemini_api_key}"
            async with httpx.AsyncClient(timeout=15) as client:
                try:
                    res = await client.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
                    if res.status_code == 200:
                        raw = res.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                        cleaned = raw.replace("```json", "").replace("```", "").strip()
                        data = json.loads(cleaned)
                        if isinstance(data, dict) and "summary" in data and "scenarios" in data:
                            return data
                except Exception:
                    pass

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
                if response.status_code == 200:
                    raw = response.json().get("response", "").strip()
                    cleaned = raw.replace("```json", "").replace("```", "").strip()
                    data = json.loads(cleaned)
                    if isinstance(data, dict) and "summary" in data and "scenarios" in data:
                        return data
            except Exception:
                pass

        return {
            "summary": "Email received. Review sender's points and select a reply strategy.",
            "sentiment": "Action Item",
            "scenarios": [
                "Acknowledge receipt and confirm next steps",
                "Request more details or clarification",
                "Provide brief confirmation"
            ],
            "quick_chip": "Confirm receipt and next steps"
        }

    @staticmethod
    async def chat_stream(
        email_context: str, 
        messages: List[Dict[str, str]], 
        user_name: str = "",
        user_email: str = "",
        model_name: Optional[str] = None,
        provider: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        system_instruction = f"""You are an intelligent email assistant. You are helping the user (Name: {user_name}, Email: {user_email}) with the following email conversation:

=== EMAIL CONTEXT ===
{email_context}
=====================

Answer the user's questions, summarize key points, or draft customized replies based on this context. 
CRITICAL PERSPECTIVE RULE: When drafting or generating an email reply, you must write it STRICTLY from {user_name}'s own personal perspective in the first person ("I", "me", "my"). NEVER refer to {user_name} in the third person (for example, never say "{user_name} is currently busy" — always say "I am currently busy"; never say "{user_name} will follow up" — always say "I will follow up"). If the user requests to draft or write a reply, output the complete email draft directly."""

        formatted_prompt = f"System: {system_instruction}\n\n"
        for m in messages:
            role = "User" if m.get("role") == "user" else "Assistant"
            formatted_prompt += f"{role}: {m.get('content', '')}\n"
        formatted_prompt += "Assistant: "

        prov = provider or settings.active_provider
        if prov == "gemini" and settings.gemini_api_key:
            target_model = AIService._sanitize_gemini_model(model_name)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:streamGenerateContent?alt=sse&key={settings.gemini_api_key}"
            async with httpx.AsyncClient(timeout=60) as client:
                try:
                    async with client.stream("POST", url, json={"contents": [{"parts": [{"text": formatted_prompt}]}]}) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            if line.startswith("data: "):
                                try:
                                    parsed = json.loads(line[6:])
                                    candidates = parsed.get("candidates", [])
                                    if candidates:
                                        parts = candidates[0].get("content", {}).get("parts", [])
                                        for part in parts:
                                            txt = part.get("text", "")
                                            if txt:
                                                yield txt
                                except Exception:
                                    pass
                    return
                except (httpx.HTTPError, ConnectionResetError, OSError) as e:
                    yield f"\n[Network/Stream Error: Connection reset or unavailable - {str(e)}]"
                    return
                except Exception as e:
                    yield f"\n[Gemini Error: {str(e)}]"
                    return

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
                    if response.status_code == 404:
                        yield f"\n[Ollama Error 404: Model '{target_model}' not found in Ollama. Please run 'ollama pull {target_model}' in terminal or configure Gemini in Settings.]"
                        return
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
